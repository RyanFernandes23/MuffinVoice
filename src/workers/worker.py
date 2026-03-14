import json
import logging
import os
from datetime import datetime, timezone, timedelta
from io import BytesIO
from pathlib import Path
from typing import Optional

import boto3
import dramatiq
import redis
from src.api.utils import get_user_id_for_job, publish_notebook_status
from boto3.session import Config
from dotenv import load_dotenv
from dramatiq import group
from dramatiq.middleware import GroupCallbacks
from dramatiq.rate_limits import ConcurrentRateLimiter
from dramatiq.rate_limits.backends import RedisBackend as RateLimitRedisBackend
from dramatiq.results import Results
from dramatiq.results.backends import RedisBackend
from mutagen.mp3 import MP3
from sqlmodel import Session, create_engine, select

from src.api.schema import Notebook, User, Subscription, Plan
from src.api.token_utils import refund_tokens, calculate_text_tokens, reset_user_tokens
from src.audio_processing.audio_processor import tts_generator
from src.utils.RedisBroker import redis_broker
from src.utils.RedisClient import redis_client
from src.Chunker.chunker import segment_text
from src.TextCleaner.cleaner import cleaner_stage_2
from src.TextCleaner.cleaner_stage1 import TTSTextCleaner
from src.TextExtractor.text_extractor import TextExtractor

load_dotenv()

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

engine = create_engine(
    os.getenv("DATABASE_URL"), 
    echo=False, 
    pool_pre_ping=True, 
    pool_recycle=1800
)

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

def ensure_s3_lifecycle_policy():
    """
    Sets up a Lifecycle Policy on the 'ttsfiles' bucket to automatically 
    expire (delete) objects in the 'uploads/' prefix after 1 day.
    This addresses the 'temp file' requirement in production.
    """
    s3 = get_s3_client()
    try:
        s3.put_bucket_lifecycle_configuration(
            Bucket="ttsfiles",
            LifecycleConfiguration={
                'Rules': [
                    {
                        'ID': 'DeleteOldUploads',
                        'Prefix': 'uploads/',
                        'Status': 'Enabled',
                        'Expiration': {'Days': 1}
                    },
                ]
            }
        )
        logger.info("[S3-SETUP] Lifecycle policy for 'uploads/' set to 1 day.")
    except Exception as e:
        logger.warning(f"[S3-SETUP] Could not set lifecycle policy: {e}. (This may happen if using MinIO or non-AWS S3)")

# Initialize storage policies
ensure_s3_lifecycle_policy()

# --- DB/Redis Status Helpers ---

def update_db_status(job_id: str, status: str, total_tokens: int = None):
    try:
        with Session(engine) as session:
            statement = select(Notebook).where(Notebook.job_id == job_id)
            notebook = session.exec(statement).first()
            if notebook:
                if status == "failed":
                    if notebook.tokens_requested > 0:
                        refund_tokens(
                            session=session,
                            user_id=notebook.user_id,
                            amount=notebook.tokens_requested,
                            notebook_id=job_id,
                        )
                        logger.info(f"[DB-SYNC] Refunded {notebook.tokens_requested} tokens for failed job {job_id}")
                    session.delete(notebook)
                    session.commit()
                    logger.info(f"[DB-SYNC] Deleted failed job {job_id} from DB.")
                else:
                    notebook.status = status
                    if total_tokens is not None and status == "completed":
                        notebook.tokens_used = total_tokens
                        if notebook.tokens_requested > total_tokens:
                            refund_amount = notebook.tokens_requested - total_tokens
                            refund_tokens(
                                session=session,
                                user_id=notebook.user_id,
                                amount=refund_amount,
                                notebook_id=job_id,
                            )
                            logger.info(f"[DB-SYNC] Refunded {refund_amount} tokens for job {job_id}")
                    session.add(notebook)
                    session.commit()
                    logger.info(f"[DB-SYNC] Updated job {job_id} to {status}")
    except Exception as e:
        logger.error(f"[DB-SYNC] Failed to update/delete DB for {job_id}: {e}")

def update_job_status(job_id, status):
    redis_client.hset(f"job:{job_id}", mapping={"status": status})
    if status in ["completed", "failed"]:
        update_db_status(job_id, status)
    
    # Optional: Publish to SSE if utility is available
    try:
        user_id = get_user_id_for_job(job_id)
        if user_id:
            publish_notebook_status(user_id, job_id, status)
    except Exception:
        pass

def update_job_status_with_tokens(job_id, status, total_tokens):
    redis_client.hset(f"job:{job_id}", mapping={"status": status, "tokens_used": total_tokens})
    if status == "completed":
        update_db_status(job_id, status, total_tokens)
    else:
        update_db_status(job_id, status)

# --- Actors: Chunker ---

@dramatiq.actor(queue_name="chunking")
def process_file_task(user_id, job_id, file_path_or_key, voice):
    from src.api.utils import set_job_status
    set_job_status(job_id, "processing")
    c1_chunks = []
    c2_chunks = []
    local_path = None
    try:
        s3 = get_s3_client()
        # Horizontal Scaling: If it looks like an S3 key, download it; else use as local path (fallback)
        if file_path_or_key.startswith("uploads/"):
            local_path = Path(f"/tmp/{os.path.basename(file_path_or_key)}")
            os.makedirs("/tmp", exist_ok=True)
            s3.download_file("ttsfiles", file_path_or_key, str(local_path))
            logger.info(f"Downloaded source from S3: {file_path_or_key}")
        else:
            local_path = Path(file_path_or_key)

        logger.info(f"Starting process_file_task for job {job_id} with file {local_path}")
        cleaner1 = TTSTextCleaner()
        extractor = TextExtractor(str(local_path))
        full_text = extractor.extract_file()
        text_chunks = segment_text(full_text)
        for chunk in text_chunks:
            if isinstance(chunk, list):
                chunk = " ".join(str(item) for item in chunk)
            if not chunk or not chunk.strip():
                continue
            cleaned_chunk1 = cleaner1(chunk, abbrevate=False)
            cleaned_chunk1_for_tts = cleaner1(chunk, abbrevate=True)
            cleaned_chunk2 = cleaner_stage_2(cleaned_chunk1_for_tts)
            if cleaned_chunk1.strip() or cleaned_chunk2.strip():
                c1_chunks.append(cleaned_chunk1)
                c2_chunks.append(cleaned_chunk2)
        
        s3_prefix = f"{user_id}/{job_id}"
        s3.put_object(Bucket="ttsfiles", Key=f"{s3_prefix}/chunks_c1.json", Body=json.dumps(c1_chunks).encode("utf-8"), ContentType="application/json")
        s3.put_object(Bucket="ttsfiles", Key=f"{s3_prefix}/chunks.json", Body=json.dumps(c2_chunks).encode("utf-8"), ContentType="application/json")
        s3.put_object(Bucket="ttsfiles", Key=f"{s3_prefix}/full_text.txt", Body=full_text.encode("utf-8"), ContentType="text/plain")
        
        process_speeches.send(user_id, job_id, voice)
        logger.info(f"Queued process_speeches for job {job_id}")

        # Cleanup original upload from S3 if it was there
        if file_path_or_key.startswith("uploads/"):
            try:
                s3.delete_object(Bucket="ttsfiles", Key=file_path_or_key)
            except: pass
    except Exception as e:
        set_job_status(job_id, "failed", {"error": str(e)})
        logger.error(f"process_file_task failed for job {job_id}: {e}", exc_info=True)
        raise
    finally:
        if local_path and os.path.exists(local_path):
            try:
                os.remove(local_path)
            except: pass

# --- Actors: TTS ---

@dramatiq.actor(queue_name="default")
def process_speeches(user_id, job_id, voice):
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}"
    try:
        response = s3.get_object(Bucket="ttsfiles", Key=f"{s3_prefix}/chunks.json")
        chunks = json.loads(response["Body"].read().decode("utf-8"))
        if not chunks:
            update_job_status(job_id, "failed")
            return
        voice_prefix = f"{s3_prefix}/voices/{voice}"
        s3.put_object(Bucket="ttsfiles", Key=f"{voice_prefix}/manifest_data.json", Body=json.dumps([]).encode("utf-8"), ContentType="application/json")
        
        # Initialize progress counters in Redis (voice-specific)
        total_chunks = len(chunks)
        redis_client.hset(f"job:{job_id}:{voice}", mapping={
            "total_chunks": total_chunks,
            "completed_chunks": 0,
            "status": "processing"
        })
        
        # Also ensure the general job entry knows it's processing if needed
        redis_client.hset(f"job:{job_id}", "status", "processing")
        
        all_messages = [process_single_speech.message(i, chunk, voice, user_id, job_id) for i, chunk in enumerate(chunks)]
        g = group(all_messages)
        g.add_completion_callback(finalize_manifest.message(user_id, job_id, voice))
        g.run()
    except Exception as e:
        update_job_status(job_id, "failed")
        logger.error(f"process_speeches failed: {e}")

@dramatiq.actor(queue_name="default", store_results=True, max_retries=20, min_backoff=1000)
def process_single_speech(index, text, voice, user_id, job_id):
    # Production Concurrency Guard: Limit to 5 simultaneous SSL connections per worker
    # to avoid saturating the local tunnel or the GPU engine.
    # Uses the shared redis backend configured in middleware.
    limiter = ConcurrentRateLimiter(rate_limiter_backend, "tts_concurrency", limit=5)
    with limiter.acquire():
        # Check if job was cancelled
        if redis_client.exists(f"cancelled:{job_id}"):
            logger.info(f"[CANCEL] Job {job_id} task {index} for {voice} skipped (user deleted notebook)")
            return None

        s3 = get_s3_client()
        s3_prefix = f"{user_id}/{job_id}/voices/{voice}"
        try:
            text = " ".join(map(str, text)) if isinstance(text, list) else str(text)
            chunk_tokens = calculate_text_tokens(text)
            audio_data = b""
            if text.strip():
                with tts_generator(text, voice) as speech_output:
                    for data in speech_output.iter_bytes():
                        if data: audio_data += data
            if not audio_data: return None
            duration = MP3(BytesIO(audio_data)).info.length
            s3.put_object(Bucket="ttsfiles", Key=f"{s3_prefix}/speech{index}.mp3", Body=audio_data, ContentType="audio/mpeg")
            metadata_entry = {"index": index, "filename": f"speech{index}.mp3", "duration": duration, "tokens": chunk_tokens}
            lock = redis_client.lock(f"lock:manifest:{job_id}:{voice}", timeout=30, blocking_timeout=60)
            with lock:
                meta_key = f"{s3_prefix}/manifest_data.json"
                try:
                    resp = s3.get_object(Bucket="ttsfiles", Key=meta_key)
                    data = json.loads(resp["Body"].read().decode("utf-8"))
                except s3.exceptions.NoSuchKey:
                    data = []
                data.append(metadata_entry)
                s3.put_object(Bucket="ttsfiles", Key=meta_key, Body=json.dumps(data).encode("utf-8"), ContentType="application/json")
                
                # Increment progress counter (voice-specific)
                redis_client.hincrby(f"job:{job_id}:{voice}", "completed_chunks", 1)
                
                # Partial Refund Tracking: Log consumed tokens globally for this job
                # This allows us to calculate exactly how many tokens were 'used' vs 'wasted' if deleted mid-way
                redis_client.hincrby(f"job:{job_id}", "consumed_tokens", chunk_tokens)
                
            return metadata_entry
        except Exception as e:
            logger.error(f"process_single_speech error: {e}")
            raise

@dramatiq.actor(queue_name="default")
def finalize_manifest(user_id, job_id, voice):
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}"
    voice_prefix = f"{s3_prefix}/voices/{voice}"
    try:
        resp = s3.get_object(Bucket="ttsfiles", Key=f"{voice_prefix}/manifest_data.json")
        audio_meta = sorted(json.loads(resp["Body"].read().decode("utf-8")), key=lambda x: x["index"])
        resp_text = s3.get_object(Bucket="ttsfiles", Key=f"{s3_prefix}/chunks_c1.json")
        display_texts = json.loads(resp_text["Body"].read().decode("utf-8"))
        
        subtitle_data = {"version": "1.0", "job_id": job_id, "segments": []}
        current_time = 0.0
        manifest_lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:15", "#EXT-X-MEDIA-SEQUENCE:0"]
        
        for item in audio_meta:
            manifest_lines.append(f"#EXTINF:{item['duration']:.2f},")
            manifest_lines.append(item["filename"])
            text = display_texts[item["index"]] if item["index"] < len(display_texts) else ""
            subtitle_data["segments"].append({"start": current_time, "end": current_time + item["duration"], "text": text, "index": item["index"]})
            current_time += item["duration"]
        manifest_lines.append("#EXT-X-ENDLIST")
        
        s3.put_object(Bucket="ttsfiles", Key=f"{s3_prefix}/subtitles.json", Body=json.dumps(subtitle_data).encode("utf-8"), ContentType="application/json")
        s3.put_object(Bucket="ttsfiles", Key=f"{voice_prefix}/manifest.m3u8", Body="\n".join(manifest_lines).encode("utf-8"), ContentType="application/vnd.apple.mpegurl")
        total_tokens = sum(item.get("tokens", 0) for item in audio_meta)
        update_job_status_with_tokens(job_id, "completed", total_tokens)
        s3.delete_object(Bucket="ttsfiles", Key=f"{voice_prefix}/manifest_data.json")
        
    except Exception as e:
        logger.error(f"finalize_manifest error: {e}")
        update_db_status(job_id, "failed")

@dramatiq.actor(queue_name="default", priority=10) # Low priority background job
def cleanup_notebook_resources(user_id, job_id):
    """Production-grade background cleanup with pagination and retry safety."""
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}/"
    logger.info(f"[CLEANUP] Starting deep cleanup for {job_id}")

    try:
        # 1. Paginated S3 Deletion (Handles 1000+ objects safely)
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket="ttsfiles", Prefix=s3_prefix):
            if "Contents" in page:
                objects = [{"Key": obj["Key"]} for obj in page["Contents"]]
                s3.delete_objects(Bucket="ttsfiles", Delete={"Objects": objects})
                logger.info(f"[CLEANUP] Deleted batch of {len(objects)} objects from S3")

        # 2. Redis Deep Cleanup
        # We delete everything: job hash, voice status hashes, and manifest locks
        keys_to_delete = [f"job:{job_id}", f"cancelled:{job_id}"]
        # Find all keys related to this job using scan (safe for production)
        for key in redis_client.scan_iter(f"*:{job_id}*"):
            keys_to_delete.append(key)
        
        if keys_to_delete:
            redis_client.delete(*list(set(keys_to_delete)))
            logger.info(f"[CLEANUP] Flushed {len(keys_to_delete)} Redis keys")

    except Exception as e:
        logger.error(f"[CLEANUP] Failed cleanup for {job_id}: {e}")
        raise # Dramatiq will retry if it fails

# --- Actors: System Jobs ---

@dramatiq.actor
def monthly_token_reset():
    logger.info("[MONTHLY_RESET] Starting reset job")
    try:
        with Session(engine) as session:
            active_subs = session.exec(select(Subscription).where(Subscription.status == "active")).all()
            for sub in active_subs:
                user = session.exec(select(User).where(User.user_id == sub.user_id)).first()
                if user:
                    plan = session.exec(select(Plan).where(Plan.plan_id == sub.plan_id)).first()
                    if plan:
                        reset_user_tokens(session=session, user_id=user.user_id, new_token_limit=plan.token_limit, reason="monthly_reset")
    except Exception as e:
        logger.error(f"monthly_token_reset error: {e}")

@dramatiq.actor
def check_expired_subscriptions():
    logger.info("[EXPIRY_CHECK] Starting cleanup")
    try:
        with Session(engine) as session:
            expired_subs = session.exec(select(Subscription).where(Subscription.status == "expired")).all()
            explorer_plan = session.exec(select(Plan).where(Plan.name == "explorer")).first()
            if not explorer_plan: return
            for sub in expired_subs:
                user = session.exec(select(User).where(User.user_id == sub.user_id)).first()
                if user and user.tokens_allocated != explorer_plan.token_limit:
                    reset_user_tokens(session=session, user_id=user.user_id, new_token_limit=explorer_plan.token_limit, reason="subscription_expired_cleanup")
    except Exception as e:
        logger.error(f"check_expired_subscriptions error: {e}")

# --- Scheduling Functions ---

def schedule_monthly_reset():
    now = datetime.now(timezone.utc)
    next_run = (now.replace(day=1) + timedelta(days=32)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    delay_ms = int((next_run - now).total_seconds() * 1000)
    monthly_token_reset.send_with_options(delay=delay_ms)
    logger.info(f"[SCHEDULER] Monthly reset scheduled for {next_run}")

def schedule_daily_checks():
    now = datetime.now(timezone.utc)
    tomorrow_2am = (now + timedelta(days=1)).replace(hour=2, minute=0, second=0, microsecond=0)
    delay_ms = int((tomorrow_2am - now).total_seconds() * 1000)
    check_expired_subscriptions.send_with_options(delay=delay_ms)
    logger.info(f"[SCHEDULER] Daily expiry check scheduled for {tomorrow_2am}")
