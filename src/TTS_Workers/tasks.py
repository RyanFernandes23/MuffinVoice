import dramatiq
from dramatiq import group, pipeline
import boto3
from boto3.session import Config
from src.audio_processing.audio_processor import tts_generator
from src.utils.RedisBroker import redis_broker
from src.utils.RedisClient import redis_client
import json, os
from io import BytesIO
from mutagen.mp3 import MP3
import redis
import logging
from dotenv import load_dotenv
from dramatiq.middleware import GroupCallbacks
from dramatiq.results.backends import RedisBackend
from dramatiq.rate_limits.backends import RedisBackend as RateLimitRedisBackend
from dramatiq.results import Results
from sqlmodel import SQLModel, Field, Session, create_engine, select
from typing import Optional
from datetime import datetime
from src.api.schema import Notebook

load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

engine = create_engine(os.getenv("DATABASE_URL"), echo=False)

# --- DB Update Function ---
def update_db_status(job_id: str, status: str):
    """
    Syncs the final status to the SQL database.
    """
    try:
        with Session(engine) as session:
            statement = select(Notebook).where(Notebook.job_id == job_id)
            notebook = session.exec(statement).first()
            if notebook:
                notebook.status = status
                session.add(notebook)
                session.commit()
                logging.info(f"[DB-SYNC] Updated job {job_id} to {status}")
            else:
                logging.warning(f"[DB-SYNC] Job {job_id} not found in DB")
    except Exception as e:
        logging.error(f"[DB-SYNC] Failed to update DB: {e}")

# --- Redis Update ---
def update_job_status(job_id, status):
    # 1. Update Redis (Hot Data)
    redis_client.hset(f"job:{job_id}", mapping={"status": status})
    logging.info(f"Job {job_id} status updated to {status} in Redis")
    
    # 2. Update SQL (Cold Data) - Only on completion or failure
    if status in ["completed", "failed"]:
        update_db_status(job_id, status)

# --- Middleware Setup ---
result_backend = RedisBackend(client=redis_client)
rate_limiter_backend = RateLimitRedisBackend(client=redis_client)
redis_broker.add_middleware(Results(backend=result_backend))
redis_broker.add_middleware(GroupCallbacks(rate_limiter_backend=rate_limiter_backend))
dramatiq.set_broker(redis_broker)

def get_s3_client():
    s3 = boto3.client(
        "s3",
        endpoint_url=os.getenv("S3_ENDPOINT_URL"),
        aws_access_key_id=os.getenv("S3_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("S3_SECRET_ACCESS_KEY"),
        region_name=os.getenv("S3_REGION_NAME"),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"})
    )
    return s3

def chunks_in_batches(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

@dramatiq.actor
def process_speeches(user_id, job_id, voice):
    batch_size = 50
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}"
    
    try:
        logging.info(f"Starting process_speeches for job {job_id}")
        response = s3.get_object(Bucket="ttsfiles", Key=f"{s3_prefix}/chunks.json")
        chunks = json.loads(response["Body"].read().decode("utf-8"))

        # Initialize empty metadata file (we use this to store duration/index for both manifest and subtitles)
        voice_prefix = f"{s3_prefix}/voices/{voice}"
        s3.put_object(
            Bucket="ttsfiles",
            Key=f"{voice_prefix}/manifest_data.json",
            Body=json.dumps([]).encode("utf-8"),
            ContentType="application/json"
        )

        previous = None
        total_batches = (len(chunks) + batch_size - 1) // batch_size

        for batch_index, batch in enumerate(chunks_in_batches(chunks, batch_size)):
            logging.info(f"[Batch {batch_index + 1}/{total_batches}] Processing {len(batch)} chunks...")
            
            start_index = batch_index * batch_size
            g = group(
                process_single_speech.message(start_index + i, chunk, voice, user_id, job_id)
                for i, chunk in enumerate(batch)
            )

            if previous:
                previous = pipeline(previous, g)
            else:
                previous = g

        if previous:
            previous.add_completion_callback(
                finalize_manifest.message(user_id, job_id, voice)
            )
            previous.run()
        
        logging.info(f"[TASK] Queued finalize_manifest callback for {voice} (job {job_id})")
        
    except Exception as e:
        update_job_status(job_id, "failed")
        logging.error(f"process_speeches failed for job {job_id}: {e}", exc_info=True)
        raise

@dramatiq.actor(store_results=True)
def process_single_speech(index, text, voice, user_id, job_id):
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}/voices/{voice}"
    bucket = "ttsfiles"

    try:
        if isinstance(text, list):
            text = " ".join(map(str, text))
        elif not isinstance(text, str):
            text = str(text)
                    
        audio_data = b""
        with tts_generator(text, voice) as speech_output:
            for data in speech_output.iter_bytes():
                if data:
                    audio_data += data

        # Calculate duration directly from BytesIO
        duration = MP3(BytesIO(audio_data)).info.length

        mp3_key = f"{s3_prefix}/speech{index}.mp3"
        s3.put_object(Bucket=bucket, Key=mp3_key, Body=audio_data, ContentType="audio/mpeg")
        
        # We store minimal metadata needed for both M3U8 and Subtitles
        metadata_entry = {"index": index, "filename": f"speech{index}.mp3", "duration": duration}

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
                ContentType="application/json"
            )

        return metadata_entry # Not strictly used by pipeline callback, but good for debugging results

    except Exception as e:
        logging.error(f"[ERROR] process_single_speech index={index}: {e}", exc_info=True)
        raise

@dramatiq.actor
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
            logging.error(f"CRITICAL: {manifest_data_key} not found. Did workers finish?")
            update_job_status(job_id, "failed")
            return # Stop here

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
        manifest_lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:15", "#EXT-X-MEDIA-SEQUENCE:0"]

        for item in audio_meta:
            manifest_lines.append(f"#EXTINF:{item['duration']:.2f},")
            manifest_lines.append(item["filename"])
            
            idx = item["index"]
            # Safe access to text
            text = display_texts[idx] if idx < len(display_texts) else "[Text Missing]"
            
            subtitle_data["segments"].append({
                "start": current_time,
                "end": current_time + item['duration'],
                "text": text,
                "index": idx
            })
            current_time += item['duration']

        manifest_lines.append("#EXT-X-ENDLIST")

        # 4. UPLOAD SUBTITLES (The missing piece)
        sub_key = f"{s3_prefix}/subtitles.json"
        logging.info(f"Uploading subtitles to {sub_key}")
        s3.put_object(
            Bucket=bucket, 
            Key=sub_key, 
            Body=json.dumps(subtitle_data).encode("utf-8"), 
            ContentType="application/json"
        )

        # 5. UPLOAD MANIFEST
        s3.put_object(
            Bucket=bucket,
            Key=f"{voice_prefix}/manifest.m3u8",
            Body="\n".join(manifest_lines).encode("utf-8"),
            ContentType="application/vnd.apple.mpegurl"
        )
        
        logging.info(f"--- SUCCESS: Subtitles and Manifest uploaded for {job_id} ---")
        update_job_status(job_id, "completed")

        # Cleanup
        s3.delete_object(Bucket=bucket, Key=manifest_data_key)

    except Exception as e:
        logging.error(f"Finalize crashed: {e}", exc_info=True)
        update_job_status(job_id, "failed")


