import json
import logging
import os
from pathlib import Path

import dramatiq
from dramatiq.middleware import GroupCallbacks
from dramatiq.rate_limits.backends import RedisBackend as RateLimitRedisBackend
from dramatiq.results import Results
from dramatiq.results.backends import RedisBackend

from src.Chunker.chunker import segment_text
from src.TextCleaner.cleaner import cleaner_stage_2
from src.TextCleaner.cleaner_stage1 import TTSTextCleaner
from src.TextExtractor.text_extractor import TextExtractor

# Import the destination TTS actor to enqueue the next job
from src.workers.tts_tasks import get_s3_client, process_speeches
from src.utils.RedisBroker import redis_broker
from src.utils.RedisClient import redis_client

# Setting up Dramatiq Broker (Needed for dispatching and receiving from same broker)
result_backend = RedisBackend(client=redis_client)
rate_limiter_backend = RateLimitRedisBackend(client=redis_client)

# Check if middleware already added to avoid duplicates
if not any(isinstance(m, Results) for m in redis_broker.middleware):
    redis_broker.add_middleware(Results(backend=result_backend))
if not any(isinstance(m, GroupCallbacks) for m in redis_broker.middleware):
    redis_broker.add_middleware(GroupCallbacks(rate_limiter_backend=rate_limiter_backend))
dramatiq.set_broker(redis_broker)


@dramatiq.actor(queue_name="chunking")
def process_file_task(user_id, job_id, file_path, voice):
    # Import locally to avoid circular imports if api.utils imports this (or use redis client directly)
    from src.api.utils import set_job_status
    
    # Update status to processing in Redis AND DB
    set_job_status(job_id, "processing")

    c1_chunks = []
    c2_chunks = []
    try:
        logging.info(
            f"Starting process_file_task for job {job_id} with file {file_path}"
        )
        cleaner1 = TTSTextCleaner()

        extractor = TextExtractor(file_path)
        full_text = extractor.extract_file()
        text_chunks = segment_text(full_text)

        for chunk in text_chunks:
            if isinstance(chunk, list):
                chunk = " ".join(str(item) for item in chunk)

            if not chunk or not chunk.strip():
                continue

            cleaned_chunk1 = cleaner1(chunk, abbrevate=False)
            
            # Use a separate cleaning path for TTS to avoid modifying the display text
            cleaned_chunk1_for_tts = cleaner1(chunk, abbrevate=True)
            cleaned_chunk2 = cleaner_stage_2(cleaned_chunk1_for_tts)

            # Only add chunks that contain actual text to be spoken or displayed
            if cleaned_chunk1.strip() or cleaned_chunk2.strip():
                c1_chunks.append(cleaned_chunk1)
                c2_chunks.append(cleaned_chunk2)

        logging.info(f"extraction and chunking completed")

        s3 = get_s3_client()
        s3_prefix = f"{user_id}/{job_id}"

        # Upload intermediate files
        s3.put_object(
            Bucket="ttsfiles",
            Key=f"{s3_prefix}/chunks_c1.json",
            Body=json.dumps(c1_chunks).encode("utf-8"),
            ContentType="application/json",
        )

        s3.put_object(
            Bucket="ttsfiles",
            Key=f"{s3_prefix}/chunks.json",
            Body=json.dumps(c2_chunks).encode("utf-8"),
            ContentType="application/json",
        )

        s3.put_object(
            Bucket="ttsfiles",
            Key=f"{s3_prefix}/full_text.txt",
            Body=full_text.encode("utf-8"),
            ContentType="text/plain",
        )

        # Cleanup local file
        os.remove(file_path)
        logging.info(f"[TASK] Completed text extraction for {file_path}")

        # Trigger TTS Dramatiq worker on default queue
        process_speeches.send(user_id, job_id, voice)

        logging.info(f"Queued process_speeches for job {job_id}")

    except Exception as e:
        from src.api.utils import set_job_status
        set_job_status(job_id, "failed", {"error": str(e)})
        logging.error(f"process_file_task failed for job {job_id}: {e}", exc_info=True)
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
