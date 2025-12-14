import logging
# filepath: c:\Users\Hp\OneDrive\Desktop\WikiVoice\src\api\main.py
from fastapi import FastAPI, UploadFile, File, Header, HTTPException,Depends, BackgroundTasks
from werkzeug.utils import secure_filename
from pathlib import Path
from uuid import uuid4
from src.TTS_Workers.tasks import process_speeches,get_s3_client,update_job_status  # Ensure actor name matches
import redis
from sqlmodel import SQLModel, Field, Session, create_engine, select
from src.TextExtractor.text_extractor import TextExtractor
from src.Chunker.chunker import segment_text
from src.TextCleaner.cleaner import cleaner_stage_2
from src.TextCleaner.cleaner_stage1 import TTSTextCleaner
import os
from src.utils.RedisClient import redis_client
from fastapi.responses import FileResponse,Response
from fastapi.staticfiles import StaticFiles
import json
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from fastapi_clerk_auth import ClerkConfig, ClerkHTTPBearer
from src.api.schema import Notebook
from typing import Optional, List


load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

clerk_config = ClerkConfig(jwks_url=os.getenv("CLERK_JWKS_URL"))
clerk_auth = ClerkHTTPBearer(config=clerk_config)

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
    # We only sync to SQL if the status is a "milestone" to save DB writes
    # (Or just sync everything if your volume is low)
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
    # This runs AFTER the app stops (optional cleanup)

def get_session():
    with Session(engine) as session:
        yield session

def update_db_status(job_id: str, status: str):
    """
    Opens a short-lived session to sync status to SQL.
    This is safe to call from background threads.
    """
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

app = FastAPI(title="TTS API with Dramatiq",lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Frontend URL
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
        
        # NOTE: We do NOT mark as 'completed' here yet, because process_speeches
        # is async. The final completion should be handled by the worker 
        # that actually finishes the MP3 generation.
        # However, if this is the end of *this* stage:
        logger.info(f"Queued process_speeches for job {job_id}")

    except Exception as e:
        # Mark as failed in Redis AND DB
        set_job_status(job_id, "failed", {"error": str(e)})
        logging.error(f"process_file_task failed for job {job_id}: {e}", exc_info=True)
        # Clean up file if it exists
        if os.path.exists(file_path):
            os.remove(file_path)
        raise


@app.post("/upload_file")
async def upload_file(
    # Add BackgroundTasks to handle the thread properly
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    user_id: str = Header(..., alias="X-User-ID"),
    voice: str = Header("af_bella", alias="voice"),
    token_payload = Depends(clerk_auth),
    session: Session = Depends(get_session) # Inject Session
):
    
    user_id = token_payload.decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user ID")

    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)

    safe_filename = secure_filename(file.filename)
    temp_path = upload_dir / f"{uuid4().hex}-{safe_filename}"
    job_id = str(uuid4())

    with open(temp_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)

    # 1. CREATE DB ENTRY (Initial State)
    new_notebook = Notebook(
        user_id=user_id,
        job_id=job_id,
        title=file.filename,
        voice=voice,
        status="queued"
    )
    session.add(new_notebook)
    session.commit()
    set_job_status(job_id, "queued") 

    # 2. Start Processing (using BackgroundTasks for better FastAPI integration)
    background_tasks.add_task(process_file_task, user_id, job_id, str(temp_path), voice)
    
    logger.info(f"File uploaded for user {user_id}, job_id {job_id}")

    return {
        "message": "File uploaded. processing speech.",
        "voice": voice,
        "job_id": job_id
    }

# NEW: Endpoint to populate Dashboard
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
    
    # 1. Find the notebook and verify ownership
    statement = select(Notebook).where(Notebook.job_id == job_id, Notebook.user_id == user_id)
    notebook = session.exec(statement).first()

    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found or you don't have permission to delete it.")

    # 2. Delete all associated files from S3
    s3_prefix = f"{user_id}/{job_id}/"
    try:
        # List all objects with the given prefix
        response = s3.list_objects_v2(Bucket="ttsfiles", Prefix=s3_prefix)
        if 'Contents' in response:
            objects_to_delete = [{'Key': obj['Key']} for obj in response['Contents']]
            s3.delete_objects(Bucket="ttsfiles", Delete={'Objects': objects_to_delete})
            logger.info(f"Deleted all files from S3 for prefix: {s3_prefix}")
    except Exception as e:
        logger.error(f"Error deleting files from S3 for prefix {s3_prefix}: {e}")
        # Optionally, you can decide not to proceed with DB deletion if S3 fails
        raise HTTPException(status_code=500, detail="Failed to delete associated files from storage.")

    # 3. Delete from PostgreSQL
    session.delete(notebook)
    session.commit()
    logger.info(f"Deleted notebook {job_id} from database.")

    # 4. (Optional) Delete from Redis
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
async def serve_speech(user_id: str, job_id: str, voice: str, speech_index: str,
                       token_payload = Depends(clerk_auth)):
    
    if token_payload.decoded.get("sub") != user_id:
        logger.warning(f"Unauthorized: {token_payload.get('sub')} tried to access {user_id}")
        raise HTTPException(status_code=403, detail="You do not have permission to view this file.")
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


# app.mount("/", StaticFiles(directory="static", html=True), name="static")
