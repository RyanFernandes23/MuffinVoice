import dramatiq
from dramatiq import group, pipeline
import boto3
from boto3.session import Config
# from src.TextExtractor.text_extractor import TextExtractor
# from src.Chunker.chunker import segment_text
# from src.TextCleaner.cleaner import TTSTextCleaner
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

result_backend = RedisBackend(client=redis_client)
rate_limiter_backend = RateLimitRedisBackend(client=redis_client)

redis_broker.add_middleware(Results(backend=result_backend))
redis_broker.add_middleware(GroupCallbacks(rate_limiter_backend=rate_limiter_backend))

load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def update_job_status(job_id, status):
    redis_client.hset(f"job:{job_id}", mapping={"status": status})
    logging.info(f"Job {job_id} status updated to {status}")

dramatiq.set_broker(redis_broker)

def get_s3_client():
    s3 = boto3.client(
    "s3",
    endpoint_url="http://localhost:9000",
    aws_access_key_id="admin",
    aws_secret_access_key="change-me-please",
    region_name="us-east-1",
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
        response = s3.get_object(Bucket="ttsfiles", Key=f"{s3_prefix}/chunks.json") # using c2 cleaned json
        chunks = json.loads(response["Body"].read().decode("utf-8"))

        # Initialize empty manifest file
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

        # Add completion callback to final pipeline
        if previous:
            previous.add_completion_callback(
                finalize_manifest.message(user_id, job_id, voice)
            )
            previous.run()
        
        logging.info(f"[TASK] Queued finalize_manifest callback for {voice} (job {job_id})")
        
    except Exception as e:
        logging.error(f"process_speeches failed for job {job_id}: {e}", exc_info=True)
        raise


    
@dramatiq.actor(store_results=True)
def process_single_speech(index, text, voice, user_id, job_id):
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}/voices/{voice}"
    bucket = "ttsfiles"

    try:
        logging.info(f"Starting process_single_speech for job {job_id}, index {index}")

        if isinstance(text, list):
            text = " ".join(map(str, text))
        elif not isinstance(text, str):
            text = str(text)
                    
        # Generate the speech
        audio_data = b""
        with tts_generator(text, voice) as speech_output:
            for data in speech_output.iter_bytes():
                if data:
                    audio_data += data

        # Measure duration
        duration = MP3(BytesIO(audio_data)).info.length

        # Upload MP3
        mp3_key = f"{s3_prefix}/speech{index}.mp3"
        s3.put_object(Bucket=bucket, Key=mp3_key, Body=audio_data, ContentType="audio/mpeg")
        logging.info(f"[OK] Uploaded {mp3_key} ({duration:.2f}s)")

        # Atomic manifest update with Redis lock
        meta_key = f"{s3_prefix}/manifest_data.json"
        metadata_entry = {"index": index, "filename": f"speech{index}.mp3", "duration": duration}

        lock_key = f"lock:manifest:{job_id}:{voice}"
        lock = redis_client.lock(lock_key, timeout=30, blocking_timeout=60)
        
        with lock:
            # Fetch existing manifest data
            try:
                resp = s3.get_object(Bucket=bucket, Key=meta_key)
                data = json.loads(resp["Body"].read().decode("utf-8"))
            except s3.exceptions.NoSuchKey:
                data = []

            # Append new entry and re-upload
            data.append(metadata_entry)
            s3.put_object(
                Bucket=bucket,
                Key=meta_key,
                Body=json.dumps(data).encode("utf-8"),
                ContentType="application/json"
            )

        logging.info(f"[META] Added chunk {index} to manifest data")

    except Exception as e:
        logging.error(f"[ERROR] process_single_speech index={index}: {e}", exc_info=True)
        raise


@dramatiq.actor
def finalize_manifest(user_id, job_id, voice):
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}/voices/{voice}"
    bucket = "ttsfiles"

    try:
        logging.info(f"Starting finalize_manifest for job {job_id}")
        # Get metadata
        resp = s3.get_object(Bucket=bucket, Key=f"{s3_prefix}/manifest_data.json")
        data = json.loads(resp["Body"].read().decode("utf-8"))

        # Sort by chunk index
        data.sort(key=lambda x: x["index"])

        # Build manifest text
        manifest_lines = [
            "#EXTM3U",
            "#EXT-X-VERSION:3",
            "#EXT-X-TARGETDURATION:15",
            "#EXT-X-MEDIA-SEQUENCE:0"
        ]

        for item in data:
            manifest_lines.append(f"#EXTINF:{item['duration']:.2f},")
            manifest_lines.append(item["filename"])

        manifest_lines.append("#EXT-X-ENDLIST")
        manifest_content = "\n".join(manifest_lines)

        # Upload manifest
        s3.put_object(
            Bucket=bucket,
            Key=f"{s3_prefix}/manifest.m3u8",
            Body=manifest_content.encode("utf-8"),
            ContentType="application/vnd.apple.mpegurl"
        )

        logging.info(f"[HLS] Manifest finalized and uploaded for {voice}")
        update_job_status(job_id, "completed")
    # delete manifest.json artifact
        try:
            head = s3.head_object(Bucket=bucket, Key=f"{s3_prefix}/manifest.m3u8")
            if head:
                s3.delete_object(Bucket=bucket, Key=f"{s3_prefix}/manifest_data.json")
                logging.info(f"[CLEANUP] Deleted temporary manifest_data.json for {voice}")
        except Exception as e:
            logging.warning(f"[WARN] Failed to delete manifest_data.json: {e}")

    except Exception as e:
        logging.error(f"[ERROR] finalize_manifest: {e}", exc_info=True)
