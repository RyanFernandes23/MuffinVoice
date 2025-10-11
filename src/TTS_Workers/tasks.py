from celery import Celery
import json
import io
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from celery import Celery
import mutagen.mp3
import os

from src.audio_processing.audio_processor import tts_generator

def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url="http://localhost:9000",
        aws_access_key_id="admin",
        aws_secret_access_key="change-me-please",
        region_name="us-east-1",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"})
    )

celery_app = Celery('tasks', broker='redis://localhost:6379/0')


# Task 1: Checks for an existing manifest (The Gatekeeper)
@celery_app.task(bind=True)
def check_existing_manifest_task(self, user_id, job_id, voice):
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}"
    manifest_key = f"{s3_prefix}/manifests/{voice}.json"

    try:
        s3.head_object(Bucket=os.getenv("S3_BUCKET_NAME"), Key=manifest_key) #S3_BUCKET_NAME, Key=manifest_key)
        return f"Manifest for job {job_id}, voice {voice} already exists. Skipping."
    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            # Manifest doesn't exist, proceed to the next task
            return { "status": "proceed", "user_id": user_id, "job_id": job_id, "voice": voice, "s3_prefix": s3_prefix }
        raise

def get_audio_duration_seconds(audio_bytes: bytes) -> float:
        try:
            mp3 = mutagen.mp3.MP3(io.BytesIO(audio_bytes))
            return mp3.info.length
        except mutagen.MutagenError:
            return 0.0

# Task 2: Processes a single text chunk into audio (The Parallel Worker)
@celery_app.task(bind=True, max_retries=3)
def process_single_chunk_task(self, chunk_data):
    chunk_text = chunk_data['text']
    index = chunk_data['index']
    s3_prefix = chunk_data['s3_prefix']
    voice = chunk_data['voice']

    try:
        # Your TTS generation logic
        result = tts_generator(chunk_text, voice)
        audio_bytes = b''.join(result) if not isinstance(result, (bytes, bytearray)) else result

        duration_sec = get_audio_duration_seconds(audio_bytes)
        s3_key = f"{s3_prefix}/audio/{voice}/{index}.mp3"

        s3 = get_s3_client()
        s3.put_object(
            Bucket=os.getenv("S3_BUCKET_NAME"), Key=s3_key,
            Body=audio_bytes, ContentType="audio/mpeg"
        )
        return {"index": index, "duration": duration_sec, "status": "success"}

    except Exception as exc:
        # Retry this specific chunk after 60 seconds
        raise self.retry(exc=exc, countdown=60)

# Task 3: Generates and uploads the final manifest (The Assembler)
@celery_app.task(bind=True)
def create_final_manifest_task(self, user_id, job_id, voice, s3_prefix, chunk_results):
    s3 = get_s3_client()
    manifest_key = f"{s3_prefix}/manifests/{voice}.json"

    # Filter out failed chunks and sort successful ones
    successful_chunks = [result for result in chunk_results if result.get('status') == 'success']
    sorted_chunks = sorted(successful_chunks, key=lambda x: x['index'])

    if not sorted_chunks:
        raise ValueError("All chunks failed — cannot create manifest.")

    # Calculate start times and total duration
    total_duration = sum(item['duration'] for item in sorted_chunks)
    current_start_time = 0.0
    for item in sorted_chunks:
        item['start_time'] = round(current_start_time, 2)
        current_start_time += item['duration']

    # Create and upload the final manifest
    final_manifest = {
        "job_id": job_id,
        "voice": voice,
        "total_duration": round(total_duration, 2),
        "chunks": sorted_chunks
    }

    s3.put_object(
        Bucket=os.getenv("S3_BUCKET_NAME"), Key=manifest_key,
        Body=json.dumps(final_manifest, ensure_ascii=False).encode('utf-8'),
        ContentType="application/json"
    )
    return f"Successfully completed job {job_id} for voice {voice}."