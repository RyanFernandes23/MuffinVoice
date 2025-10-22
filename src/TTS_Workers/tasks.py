import dramatiq
from dramatiq import group,pipeline
from dramatiq.brokers.redis import RedisBroker
import boto3
from boto3.session import Config
from src.TextExtractor.text_extractor import TextExtractor
from src.Chunker.chunker import segment_text
from src.TextCleaner.cleaner import TTSTextCleaner
from src.audio_processing.audio_processor import tts_generator
import json, os
from io import BytesIO
from mutagen.mp3 import MP3
import redis

redis_client = redis.StrictRedis(host="localhost", port=6379, db=0, decode_responses=True)

def update_job_status(job_id, status):
    redis_client.hmset(f"job:{job_id}", {"status": status})


# Connect Dramatiq to Redis
redis_broker = RedisBroker(host="localhost", port=6379)
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
def process_file_task(user_id, job_id, file_path, voice):
    update_job_status(job_id, "processing")
    try:
        cleaner = TTSTextCleaner()
        extractor = TextExtractor(file_path)
        full_text = extractor.extract_file()
        cleaned_text = cleaner(full_text)
        text_chunks = segment_text(cleaned_text)

        s3 = get_s3_client()
        s3_prefix = f"{user_id}/{job_id}"
        s3.put_object(Bucket="ttsfiles", Key=f"{s3_prefix}/chunks.json",
                      Body=json.dumps(text_chunks).encode("utf-8"),
                      ContentType="application/json")
        s3.put_object(Bucket="ttsfiles", Key=f"{s3_prefix}/cleaned_text.txt",
                      Body=cleaned_text.encode("utf-8"),
                      ContentType="text/plain")

        os.remove(file_path)
        del full_text, cleaned_text, text_chunks, cleaner, extractor
        print(f"[TASK] Completed text extraction for {file_path}")

        # Trigger next step: process all chunks
        process_speeches.send(user_id, job_id, voice)

    except Exception as e:
        update_job_status(job_id, f"failed: {str(e)}")
        raise

@dramatiq.actor
def process_speeches(user_id, job_id, voice):
    batch_size = 50
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}"
    response = s3.get_object(Bucket="ttsfiles", Key=f"{s3_prefix}/chunks.json")
    chunks = json.loads(response["Body"].read().decode("utf-8"))

    previous = None
    total_batches = (len(chunks) + batch_size - 1) // batch_size

    for batch_index, batch in enumerate(chunks_in_batches(chunks, batch_size)):
        print(f"[Batch {batch_index + 1}/{total_batches}] Processing {len(batch)} chunks...")

        start_index = batch_index * batch_size
        g = group(
            process_single_speech.message(start_index + i, chunk, voice, user_id, job_id)
            for i, chunk in enumerate(batch)
        )

        previous = pipeline(g, previous) if previous else g.run()

    final_pipeline = pipeline(previous, finalize_manifest.message(user_id, job_id, voice))
    final_pipeline.run()

    print(f"[TASK] Queued finalize_manifest for {voice} (job {job_id})")

    
@dramatiq.actor
def process_single_speech(index, text, voice, user_id, job_id):
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}/voices/{voice}"
    bucket = "ttsfiles"

    try:
        #Generate the speech
        speech_output = tts_generator(text, voice)
        audio_data = b""
        for data in speech_output.iter_bytes():
            if data:
                audio_data += data

        #Measure duration
        duration = MP3(BytesIO(audio_data)).info.length

        #Upload MP3
        mp3_key = f"{s3_prefix}/speech{index}.mp3"
        s3.put_object(Bucket=bucket, Key=mp3_key, Body=audio_data, ContentType="audio/mpeg")
        print(f"[OK] Uploaded {mp3_key} ({duration:.2f}s)")

        #Append metadata to manifest_data.json
        meta_key = f"{s3_prefix}/manifest_data.json"
        metadata_entry = {"index": index, "filename": f"speech{index}.mp3", "duration": duration}

        # Try to fetch existing manifest data
        try:
            resp = s3.get_object(Bucket=bucket, Key=meta_key)
            data = json.loads(resp["Body"].read().decode("utf-8"))
        except s3.exceptions.NoSuchKey:
            data = []

        # Append new entry and re-upload
        data.append(metadata_entry)
        s3.put_object(Bucket=bucket, Key=meta_key,
                      Body=json.dumps(data).encode("utf-8"),
                      ContentType="application/json")

        print(f"[META] Added chunk {index} to manifest data")

    except Exception as e:
        print(f"[ERROR] process_single_speech index={index}: {e}")


@dramatiq.actor
def finalize_manifest(user_id, job_id, voice):
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}/voices/{voice}"
    bucket = "ttsfiles"

    try:
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

        print(f"[HLS] Manifest finalized and uploaded for {voice}")
        update_job_status(job_id, "completed")
    # delete manifest.json artifact
        try:
            head = s3.head_object(Bucket=bucket, Key=f"{s3_prefix}/manifest.m3u8")
            if head:
                s3.delete_object(Bucket=bucket, Key=f"{s3_prefix}/manifest_data.json")
                print(f"[CLEANUP] Deleted temporary manifest_data.json for {voice}")
        except Exception as e:
            print(f"[WARN] Failed to delete manifest_data.json: {e}")

    except Exception as e:
        print(f"[ERROR] finalize_manifest: {e}")
