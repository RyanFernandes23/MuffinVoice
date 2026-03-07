import json
import logging
import os
from datetime import datetime
from io import BytesIO
from typing import Optional

import boto3
import dramatiq
import redis
from boto3.session import Config
from dotenv import load_dotenv
from dramatiq import group
from dramatiq.middleware import GroupCallbacks
from dramatiq.rate_limits.backends import RedisBackend as RateLimitRedisBackend
from dramatiq.results import Results
from dramatiq.results.backends import RedisBackend
from mutagen.mp3 import MP3
from sqlmodel import Field, Session, SQLModel, create_engine, select

from src.api.schema import Notebook
from src.api.token_utils import refund_tokens, calculate_text_tokens
from src.audio_processing.audio_processor import tts_generator
from src.utils.RedisBroker import redis_broker
from src.utils.RedisClient import redis_client

load_dotenv()


# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)

engine = create_engine(
    os.getenv("DATABASE_URL"), 
    echo=False, 
    pool_pre_ping=True, 
    pool_recycle=1800
)


# --- DB Update Function ---
def update_db_status(job_id: str, status: str, total_tokens: int = None):
    """
    Syncs the final status to the SQL database, or removes the notebook if failed.
    Also updates token usage and handles refunds.
    """
    try:
        with Session(engine) as session:
            statement = select(Notebook).where(Notebook.job_id == job_id)
            notebook = session.exec(statement).first()
            if notebook:
                if status == "failed":
                    # Refund all tokens on failure
                    if notebook.tokens_requested > 0:
                        refund_tokens(
                            session=session,
                            user_id=notebook.user_id,
                            amount=notebook.tokens_requested,
                            notebook_id=job_id,
                        )
                        logging.info(
                            f"[DB-SYNC] Refunded {notebook.tokens_requested} tokens for failed job {job_id}"
                        )

                    session.delete(notebook)
                    session.commit()
                    logging.info(f"[DB-SYNC] Deleted failed job {job_id} from DB.")
                else:  # Only update status for non-failed final states (e.g., "completed")
                    notebook.status = status

                    # Update actual tokens used and handle refund if needed
                    if total_tokens is not None and status == "completed":
                        notebook.tokens_used = total_tokens

                        # Refund difference if actual usage < requested
                        if notebook.tokens_requested > total_tokens:
                            refund_amount = notebook.tokens_requested - total_tokens
                            refund_tokens(
                                session=session,
                                user_id=notebook.user_id,
                                amount=refund_amount,
                                notebook_id=job_id,
                            )
                            logging.info(
                                f"[DB-SYNC] Refunded {refund_amount} tokens for job {job_id} "
                                f"(requested: {notebook.tokens_requested}, actual: {total_tokens})"
                            )

                    session.add(notebook)
                    session.commit()
                    logging.info(f"[DB-SYNC] Updated job {job_id} to {status}")
            else:
                logging.warning(
                    f"[DB-SYNC] Job {job_id} not found in DB for status update/deletion."
                )
    except Exception as e:
        logging.error(f"[DB-SYNC] Failed to update/delete DB for {job_id}: {e}")


# --- Redis Update ---
def update_job_status(job_id, status):
    # 1. Update Redis (Hot Data)
    redis_client.hset(f"job:{job_id}", mapping={"status": status})
    logging.info(f"Job {job_id} status updated to {status} in Redis")

    # 2. Update SQL (Cold Data) - Only on completion or failure
    if status in ["completed", "failed"]:
        update_db_status(job_id, status)


def update_job_status_with_tokens(job_id, status, total_tokens):
    """Update job status with token tracking for completed jobs."""
    # 1. Update Redis (Hot Data)
    redis_client.hset(
        f"job:{job_id}", mapping={"status": status, "tokens_used": total_tokens}
    )
    logging.info(
        f"Job {job_id} status updated to {status} with {total_tokens} tokens in Redis"
    )

    # 2. Update SQL (Cold Data) - Pass total tokens for refund calculation
    if status == "completed":
        update_db_status(job_id, status, total_tokens)
    else:
        update_db_status(job_id, status)


@dramatiq.actor
def complete_job_status(job_id, final_status):
    update_job_status(job_id, final_status)
    logging.info(f"Job {job_id} definitively {final_status}.")


# --- Middleware Setup ---
result_backend = RedisBackend(client=redis_client)
rate_limiter_backend = RateLimitRedisBackend(client=redis_client)
if not any(isinstance(m, Results) for m in redis_broker.middleware):
    redis_broker.add_middleware(Results(backend=result_backend))
if not any(isinstance(m, GroupCallbacks) for m in redis_broker.middleware):
    redis_broker.add_middleware(GroupCallbacks(rate_limiter_backend=rate_limiter_backend))
dramatiq.set_broker(redis_broker)

_s3_client = None

def get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=os.getenv("S3_ENDPOINT_URL"),
            aws_access_key_id=os.getenv("S3_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("S3_SECRET_ACCESS_KEY"),
            region_name=os.getenv("S3_REGION_NAME"),
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}, retries={"max_attempts": 3}),
        )
    return _s3_client


@dramatiq.actor(queue_name="default")
def process_speeches(user_id, job_id, voice):
    """Orchestrator: dispatches all TTS chunks in parallel, then finalizes."""
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}"

    try:
        logging.info(f"Starting process_speeches for job {job_id}")

        # Load chunks from S3
        response = s3.get_object(Bucket="ttsfiles", Key=f"{s3_prefix}/chunks.json")
        chunks = json.loads(response["Body"].read().decode("utf-8"))

        if not chunks:
            logging.warning(f"No chunks found for job {job_id}. Marking as failed.")
            update_job_status(job_id, "failed")
            return

        # Initialize empty manifest metadata file
        voice_prefix = f"{s3_prefix}/voices/{voice}"
        s3.put_object(
            Bucket="ttsfiles",
            Key=f"{voice_prefix}/manifest_data.json",
            Body=json.dumps([]).encode("utf-8"),
            ContentType="application/json",
        )

        # Create ONE group with ALL chunk messages (parallel execution)
        all_messages = [
            process_single_speech.message(i, chunk, voice, user_id, job_id)
            for i, chunk in enumerate(chunks)
        ]

        logging.info(
            f"[TASK] Dispatching {len(all_messages)} chunks for {voice} (job {job_id})"
        )

        g = group(all_messages)

        # When ALL chunks finish successfully, run finalize_manifest
        g.add_completion_callback(
            finalize_manifest.message(user_id, job_id, voice)
        )

        g.run()

        logging.info(
            f"[TASK] Group dispatched for {voice} (job {job_id})"
        )

    except Exception as e:
        update_job_status(job_id, "failed")
        logging.error(
            f"process_speeches failed for job {job_id}: {e}", exc_info=True
        )


@dramatiq.actor(queue_name="default", store_results=True, max_retries=20, min_backoff=1000)
def process_single_speech(index, text, voice, user_id, job_id):
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}/voices/{voice}"
    bucket = "ttsfiles"

    try:
        if isinstance(text, list):
            text = " ".join(map(str, text))
        elif not isinstance(text, str):
            text = str(text)

        # Calculate actual tokens (character count) for this chunk
        chunk_tokens = calculate_text_tokens(text)

        audio_data = b""
        if text.strip():
            with tts_generator(text, voice) as speech_output:
                for data in speech_output.iter_bytes():
                    if data:
                        audio_data += data

        # Calculate duration directly from BytesIO
        if not audio_data:
            logging.warning(f"[WARNING] No audio data generated for chunk {index}")
            return None # Skip this chunk

        try:
            duration = MP3(BytesIO(audio_data)).info.length
        except Exception as e:
            logging.error(f"[ERROR] process_single_speech index={index}: Failed to parse MP3 headers: {e}")
            # If we can't get duration, we can't safely include it in HLS manifest
            return None

        mp3_key = f"{s3_prefix}/speech{index}.mp3"
        s3.put_object(
            Bucket=bucket, Key=mp3_key, Body=audio_data, ContentType="audio/mpeg"
        )

        # We store minimal metadata needed for both M3U8 and Subtitles
        metadata_entry = {
            "index": index,
            "filename": f"speech{index}.mp3",
            "duration": duration,
            "tokens": chunk_tokens,  # Track tokens for this chunk
        }

        meta_key = f"{s3_prefix}/manifest_data.json"
        lock_key = f"lock:manifest:{job_id}:{voice}"
        lock = redis_client.lock(lock_key, timeout=30, blocking_timeout=60)

        with lock:
            try:
                resp = s3.get_object(Bucket=bucket, Key=meta_key)
                data = json.loads(resp["Body"].read().decode("utf-8"))
            except s3.exceptions.NoSuchKey:
                data = []

            data.append(metadata_entry)
            s3.put_object(
                Bucket=bucket,
                Key=meta_key,
                Body=json.dumps(data).encode("utf-8"),
                ContentType="application/json",
            )

        return metadata_entry  # Not strictly used by pipeline callback, but good for debugging results

    except Exception as e:
        logging.error(
            f"[ERROR] process_single_speech index={index}: {e}", exc_info=True
        )
        raise


@dramatiq.actor(queue_name="default")
def finalize_manifest(user_id, job_id, voice):
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}"
    voice_prefix = f"{s3_prefix}/voices/{voice}"
    bucket = "ttsfiles"

    try:
        logging.info(f"--- STARTING FINALIZE for {job_id} ---")

        # 1. CHECK MANIFEST DATA
        manifest_data_key = f"{voice_prefix}/manifest_data.json"
        try:
            resp = s3.get_object(Bucket=bucket, Key=manifest_data_key)
            audio_meta = json.loads(resp["Body"].read().decode("utf-8"))
            audio_meta.sort(key=lambda x: x["index"])
        except s3.exceptions.NoSuchKey:
            logging.error(
                f"CRITICAL: {manifest_data_key} not found. Did workers finish?"
            )
            update_job_status(job_id, "failed")
            return  # Stop here

        if not audio_meta:
            logging.error(f"CRITICAL: manifest_data.json is empty for job {job_id}.")
            update_job_status(job_id, "failed")
            return

        # 2. LOAD CHUNKS (Your structure confirms this file exists)
        try:
            resp_text = s3.get_object(Bucket=bucket, Key=f"{s3_prefix}/chunks_c1.json")
            display_texts = json.loads(resp_text["Body"].read().decode("utf-8"))
        except Exception as e:
            logging.error(f"Failed to load text chunks: {e}")
            display_texts = []

        # 3. CONSTRUCT SUBTITLES
        subtitle_data = {"version": "1.0", "job_id": job_id, "segments": []}
        current_time = 0.0

        # Build manifest lines concurrently
        manifest_lines = [
            "#EXTM3U",
            "#EXT-X-VERSION:3",
            "#EXT-X-TARGETDURATION:15",
            "#EXT-X-MEDIA-SEQUENCE:0",
        ]

        for item in audio_meta:
            manifest_lines.append(f"#EXTINF:{item['duration']:.2f},")
            manifest_lines.append(item["filename"])

            idx = item["index"]
            # Safe access to text
            text = display_texts[idx] if idx < len(display_texts) else "[Text Missing]"

            subtitle_data["segments"].append(
                {
                    "start": current_time,
                    "end": current_time + item["duration"],
                    "text": text,
                    "index": idx,
                }
            )
            current_time += item["duration"]

        manifest_lines.append("#EXT-X-ENDLIST")

        # 4. UPLOAD SUBTITLES
        sub_key = f"{s3_prefix}/subtitles.json"
        logging.info(f"Uploading subtitles to {sub_key}")
        s3.put_object(
            Bucket=bucket,
            Key=sub_key,
            Body=json.dumps(subtitle_data).encode("utf-8"),
            ContentType="application/json",
        )

        # 5. UPLOAD MANIFEST
        s3.put_object(
            Bucket=bucket,
            Key=f"{voice_prefix}/manifest.m3u8",
            Body="\n".join(manifest_lines).encode("utf-8"),
            ContentType="application/vnd.apple.mpegurl",
        )

        # Calculate total actual tokens used from all processed chunks
        total_tokens_used = sum(item.get("tokens", 0) for item in audio_meta)
        logging.info(f"--- SUCCESS: Subtitles and Manifest uploaded for {job_id} ---")
        logging.info(
            f"[TOKENS] Total tokens used for job {job_id}: {total_tokens_used}"
        )

        # Pass total tokens to update_job_status
        update_job_status_with_tokens(job_id, "completed", total_tokens_used)

        # Cleanup
        s3.delete_object(Bucket=bucket, Key=manifest_data_key)

    except Exception as e:
        logging.error(f"Finalize crashed: {e}", exc_info=True)
        update_job_status(job_id, "failed")
