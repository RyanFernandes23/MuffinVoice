import json
import io
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from celery import Celery
import mutagen.mp3

from src.audio_processing.audio_processor import tts_generator

# --- Celery and Boto3 Setup for Worker ---
celery_app = Celery('tasks', broker='redis://localhost:6379/0', backend='redis://localhost:6379/0')
S3_BUCKET_NAME = "ttsfiles"

def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url="http://localhost:9000",
        aws_access_key_id="admin",
        aws_secret_access_key="change-me-please",
        region_name="us-east-1",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"})
    )

def get_audio_duration_seconds(audio_bytes: bytes) -> float:
        try:
            mp3 = mutagen.mp3.MP3(io.BytesIO(audio_bytes))  # ✅ Fixed
            return mp3.info.length
        except mutagen.MutagenError:
            return 0.0

@celery_app.task(bind=True, acks_late=True, max_retries=3)
def generate_and_save_manifest_task(self, user_id, job_id, voice):
    """
    Generates all audio chunks for a given job & voice,
    uploads to S3, and creates a manifest file.
    """
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}"
    manifest_key = f"{s3_prefix}/manifests/{voice}.json"

    # ✅ Idempotency check – skip if already exists
    try:
        s3.head_object(Bucket=S3_BUCKET_NAME, Key=manifest_key)
        return f"Manifest for job {job_id}, voice {voice} already exists. Skipping."
    except ClientError as e:
        if e.response['Error']['Code'] != '404':
            raise

    try:
        chunks_response = s3.get_object(Bucket=S3_BUCKET_NAME, Key=f"{s3_prefix}/chunks.json")
        all_text_chunks = json.loads(chunks_response['Body'].read())

        chunk_metadata = []

        for i, chunk_text in enumerate(all_text_chunks):
            try:
                result = tts_generator(chunk_text, voice)

                # Convert generator to full bytes
                if isinstance(result, (bytes, bytearray)):
                    audio_bytes = result
                else:
                    audio_bytes = b''.join(result)

                duration_sec = get_audio_duration_seconds(audio_bytes)

                s3_key = f"{s3_prefix}/audio/{voice}/{i}.mp3"
                s3.put_object(
                    Bucket=S3_BUCKET_NAME, Key=s3_key,
                    Body=audio_bytes, ContentType="audio/mpeg"
                )
                chunk_metadata.append({"index": i, "duration": duration_sec})
            except Exception as chunk_error:
                print(f"Failed to process chunk {i} for job {job_id}: {chunk_error}")
                continue

        # ✅ If no chunks succeeded → retry instead of pretending success
        if not chunk_metadata:
            raise ValueError("All chunks failed — retrying task.")

        total_duration = sum(item['duration'] for item in chunk_metadata)
        current_start_time = 0.0
        for item in sorted(chunk_metadata, key=lambda x: x['index']):
            item['start_time'] = round(current_start_time, 2)
            current_start_time += item['duration']

        final_manifest = {
            "job_id": job_id,
            "voice": voice,
            "total_duration": round(total_duration, 2),
            "chunks": sorted(chunk_metadata, key=lambda x: x['index'])
        }

        s3.put_object(
            Bucket=S3_BUCKET_NAME, Key=manifest_key,
            Body=json.dumps(final_manifest, ensure_ascii=False).encode('utf-8'),
            ContentType="application/json"
        )

        return f"Successfully completed job {job_id} for voice {voice}."

    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
