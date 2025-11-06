import logging
# filepath: c:\Users\Hp\OneDrive\Desktop\WikiVoice\src\api\main.py
from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from werkzeug.utils import secure_filename
from pathlib import Path
from uuid import uuid4
from src.TTS_Workers.tasks import process_speeches,get_s3_client,update_job_status  # Ensure actor name matches
import redis
from src.TextExtractor.text_extractor import TextExtractor
from src.Chunker.chunker import segment_text
from src.TextCleaner.cleaner import cleaner_stage_2
from src.TextCleaner.cleaner_stage1 import TTSTextCleaner
import os
from src.utils.RedisClient import redis_client
from fastapi.responses import FileResponse,Response
from fastapi.staticfiles import StaticFiles
import json
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def set_job_status(job_id: str, status: str, extra: dict = None):
    data = {"status": status}
    if extra:
        data.update(extra)
    redis_client.hset(f"job:{job_id}", data)
    logger.info(f"Job {job_id} status updated to {status}")

def get_job_status(job_id: str):
    job_status = redis_client.hgetall(f"job:{job_id}")
    logger.info(f"Job {job_id} status retrieved: {job_status}")
    return job_status

app = FastAPI(title="TTS API with Dramatiq")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

s3 = get_s3_client()

def process_file_task(user_id, job_id, file_path, voice):
    update_job_status(job_id, "processing")
    c1_chunks = []
    c2_chunks = []
    try:
        logging.info(f"Starting process_file_task for job {job_id} with file {file_path}")
        cleaner1 = TTSTextCleaner()

        extractor = TextExtractor(file_path)
        full_text = extractor.extract_file()
        text_chunks = segment_text(full_text)
        for chunk in text_chunks:
            cleaned_chunk1 = cleaner1(chunk)
            c1_chunks.append(cleaned_chunk1)
            cleaned_chunk2 = cleaner_stage_2(cleaned_chunk1)
            c2_chunks.append(cleaned_chunk2)
        
        logging.info(f"extraction and chunking completed")

        s3_prefix = f"{user_id}/{job_id}"
        s3.put_object(Bucket="ttsfiles", Key=f"{s3_prefix}/chunks_c1.json",
                      Body=json.dumps(c1_chunks).encode("utf-8"),
                      ContentType="application/json")
        logging.info(f"appended chunks_c1.json to {s3_prefix}")

        s3.put_object(Bucket="ttsfiles", Key=f"{s3_prefix}/chunks.json",
                      Body=json.dumps(c2_chunks).encode("utf-8"),
                      ContentType="application/json")
        logging.info(f"appended chunks_c2.json AKA chunks.json to {s3_prefix}")

        s3.put_object(Bucket="ttsfiles", Key=f"{s3_prefix}/full_text.txt",
                      Body=full_text.encode("utf-8"),
                      ContentType="text/plain")
        logging.info(f"appended full text to {s3_prefix}")

        os.remove(file_path)
        del full_text, cleaned_text, text_chunks, cleaner, extractor,c1_chunks,c2_chunks
        logging.info(f"[TASK] Completed text extraction for {file_path}")

        # Trigger next step: process all chunks
        process_speeches.send(user_id, job_id, voice)
        logging.info(f"Queued process_speeches for job {job_id}")
    except Exception as e:
        update_job_status(job_id, f"failed: {str(e)}")
        logging.error(f"process_file_task failed for job {job_id}: {e}", exc_info=True)
        raise

@app.post("/upload_file")
async def upload_file(
    file: UploadFile = File(...),
    user_id: str = Header(..., alias="X-User-ID"),
    voice: str = Header("af_bella", alias="voice")  # Default voice is af_bella if not provided
):
    # Create upload dir if missing
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)

    # Secure + unique filename
    safe_filename = secure_filename(file.filename)
    temp_path = upload_dir / f"{uuid4().hex}-{safe_filename}"
    job_id = str(uuid4())

    # Save uploaded file to disk
    with open(temp_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)

    # Trigger Dramatiq background job
    process_file_task(user_id,job_id,str(temp_path),voice)
    logger.info(f"File uploaded for user {user_id}, job_id {job_id}, voice {voice}")


    return {
        "message": "File uploaded. processing speech.",
        "voice": voice,
        "job_id": job_id
    }

@app.get("/job_status/{job_id}")
async def job_status(job_id: str):
    data = get_job_status(job_id)
    if not data:
        logger.warning(f"Job ID {job_id} not found.")
        raise HTTPException(status_code=404, detail="Job ID not found.")
    return data

@app.get("/stream/{user_id}/{job_id}/{voice}/manifest.m3u8")
async def serve_manifest(user_id: str, job_id: str, voice: str):
    s3_prefix = f"{user_id}/{job_id}/voices/{voice}/manifest.m3u8"
    
    # Download manifest temporarily
    try:
        obj = s3.get_object(Bucket="ttsfiles", Key=s3_prefix)
        content = obj["Body"].read()
        logger.info(f"Manifest file streamed for user {user_id}, job_id {job_id}, voice {voice}")
        return Response(content, media_type="application/vnd.apple.mpegurl")
    except Exception as e:
        logger.error(f"Error streaming manifest file for user {user_id}, job_id {job_id}, voice {voice}: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving manifest file")

@app.get("/stream/{user_id}/{job_id}/{voice}/{speech_index}")
async def serve_speech(user_id: str, job_id: str, voice: str, speech_index: str):
    s3_prefix = f"{user_id}/{job_id}/voices/{voice}/{speech_index}"
    
    try:
        # Get the MP3 file from S3 (fixed: Key not key)
        obj = s3.get_object(Bucket="ttsfiles", Key=s3_prefix)
        content = obj["Body"].read()
        
        logger.info(f"Served {speech_index} for user {user_id}, job {job_id}, voice {voice}")
        
        # Return audio with proper MIME type
        return Response(
            content=content,
            media_type="audio/mpeg",
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(content)),
                "Cache-Control": "public, max-age=3600"
            }
        )
        
    except s3.exceptions.NoSuchKey:
        logger.error(f"Audio file not found: {s3_prefix}")
        raise HTTPException(status_code=404, detail="Audio file not found")
    except Exception as e:
        logger.error(f"Error serving audio {s3_prefix}: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving audio file")

# to get chunks_c1.json for subtitle
@app.get("/stream/chunks/{user_id}/{job_id}")
async def serve_chunk(user_id:str, job_id:str):
    s3_prefix = f"{user_id}/{job_id}/chunks_c1.json"
    try:
        obj = s3.get_object(Bucket="ttsfiles", Key=s3_prefix)
        content = obj["Body"].read()
        return Response(content, media_type="application/json")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error retrieving chunks.json")


app.mount("/", StaticFiles(directory="static", html=True), name="static")
