import logging
# filepath: c:\Users\Hp\OneDrive\Desktop\WikiVoice\src\api\main.py
from fastapi import FastAPI, UploadFile, File, Header, HTTPException, Depends, BackgroundTasks
from werkzeug.utils import secure_filename
from pathlib import Path
from uuid import uuid4
from src.TTS_Workers.tasks import process_speeches, get_s3_client, update_job_status
import redis
from sqlmodel import SQLModel, Field, Session, create_engine, select
from src.TextExtractor.text_extractor import TextExtractor
from src.Chunker.chunker import segment_text
from src.TextCleaner.cleaner import cleaner_stage_2
from src.TextCleaner.cleaner_stage1 import TTSTextCleaner
import os
from src.utils.RedisClient import redis_client
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
import json
import re
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from fastapi_clerk_auth import ClerkConfig, ClerkHTTPBearer
from src.api.schema import Notebook
from typing import Optional, List

load_dotenv()

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

# Available voices for TTS processing
AVAILABLE_VOICES = [
    'af_bella',
    'af_sarah',
    'am_michael',
    'bm_fable',
    'bf_emma',
    'em_alex'
]

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

clerk_config = ClerkConfig(jwks_url=os.getenv("CLERK_JWKS_URL"))
clerk_auth = ClerkHTTPBearer(config=clerk_config)

def sanitize_display_filename(filename: str) -> str:
    """
    Sanitizes a filename for display and database storage, removing potentially harmful characters.
    Keeps alphanumeric, spaces, periods, hyphens, and underscores.
    """
    # Using a regex to allow a broader set of "safe" characters while removing potentially malicious ones.
    # This regex keeps letters, numbers, spaces, periods, hyphens, and underscores.
    # It also removes leading/trailing spaces and multiple consecutive spaces.
    sanitized = re.sub(r'[^\w\s\.\-]', '', filename)
    sanitized = re.sub(r'\s+', ' ', sanitized).strip()
    return sanitized

def get_unique_notebook_title(user_id: str, desired_title: str, session: Session) -> str:
    """
    Generates a unique notebook title for a user, appending (N) if necessary.
    """
    base_name, ext = os.path.splitext(desired_title)
    counter = 1
    unique_title = desired_title

    while True:
        statement = select(Notebook).where(
            Notebook.user_id == user_id,
            Notebook.title == unique_title
        )
        existing_notebook = session.exec(statement).first()

        if not existing_notebook:
            return unique_title
        
        counter += 1
        unique_title = f"{base_name} ({counter}){ext}"


def set_job_status(job_id: str, status: str, extra: dict = None):
    """
    Updates BOTH Redis (for speed/real-time) and SQL (for persistence).
    """
    # 1. Update Redis
    data = {"status": status}
    if extra:
        data.update(extra)
    redis_client.hset(f"job:{job_id}", mapping=data)
    logger.info(f"DEBUG: Wrote job:{job_id} to Redis with status {status}") 

    # 2. Sync to SQL
    update_db_status(job_id, status)
    logger.info(f"Job {job_id} status updated to {status}")

def get_job_status(job_id: str):
    job_status = redis_client.hgetall(f"job:{job_id}")
    return job_status

engine = create_engine(os.getenv("DATABASE_URL"), echo=False)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # This runs BEFORE the app starts
    create_db_and_tables()
    yield
    # This runs AFTER the app stops

def get_session():
    with Session(engine) as session:
        yield session

def update_db_status(job_id: str, status: str):
    try:
        with Session(engine) as session:
            statement = select(Notebook).where(Notebook.job_id == job_id)
            notebook = session.exec(statement).first()
            if notebook:
                notebook.status = status
                session.add(notebook)
                session.commit()
                logger.info(f"Synced DB status for {job_id} to {status}")
            else:
                logger.warning(f"Could not find notebook {job_id} in DB to update status")
    except Exception as e:
        logger.error(f"Failed to sync DB status: {e}")

app = FastAPI(title="TTS API with Dramatiq", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

s3 = get_s3_client()

def process_file_task(user_id, job_id, file_path, voice):
    # Update status to processing in Redis AND DB
    set_job_status(job_id, "processing")
    
    c1_chunks = []
    c2_chunks = []
    try:
        logging.info(f"Starting process_file_task for job {job_id} with file {file_path}")
        cleaner1 = TTSTextCleaner()

        extractor = TextExtractor(file_path)
        full_text = extractor.extract_file()
        text_chunks = segment_text(full_text)
        
        for chunk in text_chunks:
            if isinstance(chunk, list):
                chunk = " ".join(str(item) for item in chunk)
            
            cleaned_chunk1 = cleaner1(chunk, abbrevate=False)
            c1_chunks.append(cleaned_chunk1)
            
            cleaned_chunk1 = cleaner1(chunk, abbrevate=True)
            cleaned_chunk2 = cleaner_stage_2(cleaned_chunk1)
            c2_chunks.append(cleaned_chunk2)
        
        logging.info(f"extraction and chunking completed")

        s3_prefix = f"{user_id}/{job_id}"
        
        # Upload intermediate files
        s3.put_object(Bucket="ttsfiles", Key=f"{s3_prefix}/chunks_c1.json",
                      Body=json.dumps(c1_chunks).encode("utf-8"),
                      ContentType="application/json")

        s3.put_object(Bucket="ttsfiles", Key=f"{s3_prefix}/chunks.json",
                      Body=json.dumps(c2_chunks).encode("utf-8"),
                      ContentType="application/json")

        s3.put_object(Bucket="ttsfiles", Key=f"{s3_prefix}/full_text.txt",
                      Body=full_text.encode("utf-8"),
                      ContentType="text/plain")

        os.remove(file_path)
        logging.info(f"[TASK] Completed text extraction for {file_path}")

        # Trigger Dramatiq worker
        process_speeches.send(user_id, job_id, voice)
        
        logger.info(f"Queued process_speeches for job {job_id}")

    except Exception as e:
        set_job_status(job_id, "failed", {"error": str(e)})
        logging.error(f"process_file_task failed for job {job_id}: {e}", exc_info=True)
        if os.path.exists(file_path):
            os.remove(file_path)
        raise

@app.post("/upload_file")
async def upload_file(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    user_id: str = Header(..., alias="X-User-ID"),
    voice: str = Header("af_bella", alias="voice"),
    token_payload = Depends(clerk_auth),
    session: Session = Depends(get_session)
):
    
    user_id = token_payload.decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user ID")

    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)

    # Sanitize the original filename for display and database storage
    original_filename = file.filename
    sanitized_display_title = sanitize_display_filename(original_filename)
    
    # Get a unique title for the notebook entry in the database
    unique_db_title = get_unique_notebook_title(user_id, sanitized_display_title, session)

    # Secure filename for saving to disk (prevents path traversal)
    safe_disk_filename = secure_filename(original_filename)
    temp_path = upload_dir / f"{uuid4().hex}-{safe_disk_filename}"
    job_id = str(uuid4())

    total_size = 0
    with open(temp_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            total_size += len(chunk)
            if total_size > MAX_FILE_SIZE:
                os.remove(temp_path)  # Clean up the partially written file
                raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // 1024 // 1024}MB.")
            f.write(chunk)

    new_notebook = Notebook(
        user_id=user_id,
        job_id=job_id,
        title=unique_db_title,  # Use the unique, sanitized title
        voice=voice,
        status="queued"
    )
    session.add(new_notebook)
    session.commit()
    set_job_status(job_id, "queued") 

    background_tasks.add_task(process_file_task, user_id, job_id, str(temp_path), voice)
    
    logger.info(f"File uploaded for user {user_id}, job_id {job_id}")

    return {
        "message": "File uploaded. processing speech.",
        "voice": voice,
        "job_id": job_id
    }

@app.get("/notebooks", response_model=List[Notebook])
async def get_my_notebooks(
    token_payload = Depends(clerk_auth),
    session: Session = Depends(get_session)
):
    user_id = token_payload.decoded.get("sub")
    statement = select(Notebook).where(Notebook.user_id == user_id).order_by(Notebook.created_at.desc())
    return session.exec(statement).all()

@app.delete("/notebooks/{job_id}", status_code=204)
async def delete_notebook(
    job_id: str,
    token_payload = Depends(clerk_auth),
    session: Session = Depends(get_session)
):
    user_id = token_payload.decoded.get("sub")
    
    statement = select(Notebook).where(Notebook.job_id == job_id, Notebook.user_id == user_id)
    notebook = session.exec(statement).first()

    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found or you don't have permission to delete it.")

    s3_prefix = f"{user_id}/{job_id}/"
    try:
        response = s3.list_objects_v2(Bucket="ttsfiles", Prefix=s3_prefix)
        if 'Contents' in response:
            objects_to_delete = [{'Key': obj['Key']} for obj in response['Contents']]
            s3.delete_objects(Bucket="ttsfiles", Delete={'Objects': objects_to_delete})
            logger.info(f"Deleted all files from S3 for prefix: {s3_prefix}")
    except Exception as e:
        logger.error(f"Error deleting files from S3 for prefix {s3_prefix}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete associated files from storage.")

    session.delete(notebook)
    session.commit()
    logger.info(f"Deleted notebook {job_id} from database.")
    redis_client.delete(f"job:{job_id}")
    logger.info(f"Deleted job {job_id} from Redis.")

    return Response(status_code=204)

@app.get("/job_status/{job_id}")
async def job_status(job_id: str, _ = Depends(clerk_auth)):
    data = get_job_status(job_id)
    if not data:
        logger.warning(f"Job ID {job_id} not found.")
        raise HTTPException(status_code=404, detail="Job ID not found.")
    return data

@app.get("/stream/{user_id}/{job_id}/{voice}/manifest.m3u8")
async def serve_manifest(user_id: str, job_id: str, voice: str, token_payload = Depends(clerk_auth)):
    
    if token_payload.decoded.get("sub") != user_id:
        logger.warning(f"Unauthorized: {token_payload.get('sub')} tried to access {user_id}")
        raise HTTPException(status_code=403, detail="You do not have permission to view this file.")
    
    s3_prefix = f"{user_id}/{job_id}/voices/{voice}/manifest.m3u8"
    
    try:
        obj = s3.get_object(Bucket="ttsfiles", Key=s3_prefix)
        content = obj["Body"].read()
        logger.info(f"Manifest file streamed for user {user_id}, job_id {job_id}, voice {voice}")
        return Response(content, media_type="application/vnd.apple.mpegurl")
    except Exception as e:
        logger.error(f"Error streaming manifest file for user {user_id}, job_id {job_id}, voice {voice}: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving manifest file")

@app.get("/stream/{user_id}/{job_id}/{voice}/{speech_index}")
async def serve_speech(user_id: str, job_id: str, voice: str, speech_index: str,
                       token_payload = Depends(clerk_auth)):
    
    if token_payload.decoded.get("sub") != user_id:
        logger.warning(f"Unauthorized: {token_payload.get('sub')} tried to access {user_id}")
        raise HTTPException(status_code=403, detail="You do not have permission to view this file.")
    s3_prefix = f"{user_id}/{job_id}/voices/{voice}/{speech_index}"
    
    try:
        obj = s3.get_object(Bucket="ttsfiles", Key=s3_prefix)
        content = obj["Body"].read()
        
        logger.info(f"Served {speech_index} for user {user_id}, job {job_id}, voice {voice}")
        
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

# --- NEW ENDPOINT: SERVE SUBTITLES (Replaces chunks logic usually) ---
@app.get("/stream/subtitles/{user_id}/{job_id}")
async def serve_subtitles(user_id: str, job_id: str, token_payload = Depends(clerk_auth)):
    
    if token_payload.decoded.get("sub") != user_id:
        logger.warning(f"Unauthorized: {token_payload.get('sub')} tried to access {user_id}")
        raise HTTPException(status_code=403, detail="You do not have permission to view this file.")
    
    s3_prefix = f"{user_id}/{job_id}/subtitles.json"
    
    try:
        obj = s3.get_object(Bucket="ttsfiles", Key=s3_prefix)
        content = obj["Body"].read()
        return Response(content, media_type="application/json")
    except s3.exceptions.NoSuchKey:
        # It's possible the job is still processing or finished without creating subtitles (if failed)
        logger.warning(f"Subtitles not found for {job_id} (might be processing)")
        raise HTTPException(status_code=404, detail="Subtitles not found or not ready")
    except Exception as e:
        logger.error(f"Error retrieving subtitles for {job_id}: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving subtitles")

# (Optional: Keep this if you need raw chunks for some other reason)
@app.get("/stream/chunks/{user_id}/{job_id}")
async def serve_chunk(user_id:str, job_id:str, token_payload = Depends(clerk_auth)):

    if token_payload.decoded.get("sub") != user_id:
        logger.warning(f"Unauthorized: {token_payload.get('sub')} tried to access {user_id}")
        raise HTTPException(status_code=403, detail="You do not have permission to view this file.")
    
    s3_prefix = f"{user_id}/{job_id}/chunks_c1.json"
    try:
        obj = s3.get_object(Bucket="ttsfiles", Key=s3_prefix)
        content = obj["Body"].read()
        return Response(content, media_type="application/json")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error retrieving chunks.json")

@app.get("/check_voice_status/{user_id}/{job_id}")
async def check_voice_status(user_id: str, job_id: str, token_payload = Depends(clerk_auth)):
    """
    Lists all available voices and their processing status for a job.
    
    Status meanings:
    - ready: Voice folder exists with audio files (manifest.m3u8 present)
    - processing: Job is processing this voice
    - not started: Voice hasn't been processed yet for this job
    """
    if token_payload.decoded.get("sub") != user_id:
        logger.warning(f"Unauthorized: {token_payload.get('sub')} tried to access {user_id}")
        raise HTTPException(status_code=403, detail="You do not have permission to view this file.")
    
    try:
        # Get job status first
        job_data = get_job_status(job_id)
        if not job_data:
            raise HTTPException(status_code=404, detail="Job not found")
        
        job_status = job_data.get("status", "unknown")
        s3_voices_prefix = f"{user_id}/{job_id}/voices/"
        
        # List all objects under the voices prefix
        response = s3.list_objects_v2(Bucket="ttsfiles", Prefix=s3_voices_prefix, Delimiter="/")
        
        # Get existing voice folders from S3
        existing_voices = set()
        if 'CommonPrefixes' in response:
            for prefix in response['CommonPrefixes']:
                voice_name = prefix['Prefix'].rstrip('/').split('/')[-1]
                existing_voices.add(voice_name)
        
        voices_status = []
        
        # Check status for all available voices
        for voice in AVAILABLE_VOICES:
            if voice in existing_voices:
                # Voice folder exists - check if manifest.m3u8 file exists
                voice_prefix = f"{s3_voices_prefix}{voice}/"
                manifest_key = f"{voice_prefix}manifest.m3u8"
                
                try:
                    # Check if manifest file exists
                    s3.head_object(Bucket="ttsfiles", Key=manifest_key)
                    # Manifest exists - voice is ready
                    status = "ready"
                except s3.exceptions.ClientError as e:
                    if e.response['Error']['Code'] == '404':
                        # Folder exists but manifest doesn't - voice is still processing
                        status = "processing"
                    else:
                        status = "processing"
            else:
                # Voice folder doesn't exist - not started yet
                status = "not started"
            
            voices_status.append({
                "name": voice,
                "status": status
            })
        
        logger.info(f"Voice status check for job {job_id}: {len(voices_status)} voices found")
        return {
            "job_id": job_id,
            "job_status": job_status,
            "voices": voices_status
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking voice status for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail="Error checking voice status")

@app.post("/process_voice/{user_id}/{job_id}/{voice}")
async def process_voice(
    user_id: str, 
    job_id: str, 
    voice: str,
    background_tasks: BackgroundTasks,
    token_payload = Depends(clerk_auth),
    session: Session = Depends(get_session)
):
    """
    Starts processing a specific voice for an existing job.
    This allows users to generate additional voices without re-uploading the file.
    """
    if token_payload.decoded.get("sub") != user_id:
        logger.warning(f"Unauthorized: {token_payload.get('sub')} tried to access {user_id}")
        raise HTTPException(status_code=403, detail="You do not have permission to perform this action.")
    
    if voice not in AVAILABLE_VOICES:
        raise HTTPException(status_code=400, detail=f"Invalid voice: {voice}")
    
    try:
        # Verify the job exists and belongs to the user
        statement = select(Notebook).where(
            Notebook.job_id == job_id,
            Notebook.user_id == user_id
        )
        notebook = session.exec(statement).first()
        
        if not notebook:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Check if voice already exists in S3
        s3_voice_prefix = f"{user_id}/{job_id}/voices/{voice}/"
        response = s3.list_objects_v2(Bucket="ttsfiles", Prefix=s3_voice_prefix, MaxKeys=1)
        
        if 'Contents' in response:
            raise HTTPException(status_code=400, detail=f"Voice {voice} is already being processed or completed for this job")
        
        # Queue the voice processing task
        background_tasks.add_task(process_speeches, user_id, job_id, voice)
        
        logger.info(f"Queued voice processing for user {user_id}, job {job_id}, voice {voice}")
        
        return {
            "message": f"Processing started for voice {voice}",
            "job_id": job_id,
            "voice": voice
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing voice {voice} for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail="Error starting voice processing")
