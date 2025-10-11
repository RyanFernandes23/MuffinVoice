import os
import json
import shutil
from uuid import uuid4
from pathlib import Path

from fastapi import (
    FastAPI, Depends, File, Header, HTTPException, UploadFile
)
from fastapi.middleware.cors import CORSMiddleware
from werkzeug.utils import secure_filename
from botocore.config import Config
from botocore.exceptions import ClientError
import boto3

# Assume your local modules are structured correctly
from src.TextExtractor.text_extractor import TextExtractor
from src.Chunker.chunker import segment_text
from src.TTS_Workers.workflows import generate_and_save_manifest_workflow

# --- FastAPI App Setup ---
app = FastAPI(
    title="Text-to-Speech API",
    description="An API that processes documents into audio and serves a playback manifest.",
    version="1.2.0",
)

# IMPORTANT: For production, replace with your frontend's specific origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- S3 & Boto3 Configuration ---
S3_BUCKET_NAME = "ttsfiles"
s3 = boto3.client(
    "s3",
    endpoint_url="http://localhost:9000",
    aws_access_key_id="admin",
    aws_secret_access_key="change-me-please",
    region_name="us-east-1",
    config=Config(signature_version="s3v4", s3={"addressing_style": "path"})
)

# --- Helper Functions ---
async def get_current_user_id(x_user_id: str = Header(...)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="X-User-ID header is missing.")
    return x_user_id

# --- API Endpoints ---
@app.post("/upload_file", status_code=202) # 202 Accepted
async def upload_file(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    voice: str = "af_bella"
):
    """
    Accepts a file, creates a job, and dispatches a background task
    to generate all audio chunks and the final manifest. Returns immediately.
    """
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)
    
    safe_filename = secure_filename(file.filename or "unknown")
    temp_path = upload_dir / f"{uuid4().hex}-{safe_filename}"
    
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 1. Extract text and segment
        extractor = TextExtractor(temp_path)
        full_text = extractor.extract_file()
        text_chunks = segment_text(full_text)
        
        if not text_chunks:
            raise HTTPException(status_code=400, detail="No text could be extracted.")

        job_id = str(uuid4())
        s3_prefix = f"{user_id}/{job_id}"

        # 2. Upload text and chunks definition to S3
        s3.put_object(
            Bucket=S3_BUCKET_NAME, Key=f"{s3_prefix}/full_text.txt",
            Body=full_text.encode('utf-8'), ContentType="text/plain; charset=utf-8"
        )
        s3.put_object(
            Bucket=S3_BUCKET_NAME, Key=f"{s3_prefix}/chunks.json",
            Body=json.dumps(text_chunks, ensure_ascii=False).encode('utf-8'),
            ContentType="application/json"
        )

        # 3. Enqueue Celery task to process the entire job for the default voice
        generate_and_save_manifest_workflow.delay(user_id, job_id, voice)
            
        return {
            "message": "Job accepted and is being processed in the background.",
            "job_id": job_id,
            "voice": voice,
            "status_endpoint": f"/job/{job_id}/status/{voice}"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.get("/job/{job_id}/status/{voice}")
async def get_job_status(
    job_id: str,
    voice: str,
    user_id: str = Depends(get_current_user_id)
):
    """Pollable endpoint to check if the manifest for a voice is ready."""
    manifest_key = f"{user_id}/{job_id}/manifests/{voice}.json"
    try:
        # A HEAD request is a lightweight way to check for existence
        s3.head_object(Bucket=S3_BUCKET_NAME, Key=manifest_key)
        return {"status": "complete"}
    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            return {"status": "processing"}
        # Handle other potential S3 errors
        raise HTTPException(status_code=500, detail=f"Storage error: {e}")


@app.get("/manifest/{job_id}/{voice}")
async def get_manifest(
    job_id: str,
    voice: str,
    user_id: str = Depends(get_current_user_id)
):
    """
    Serves the completed manifest with presigned URLs.
    If the manifest doesn't exist, it triggers a new background job.
    """
    s3_prefix = f"{user_id}/{job_id}"
    manifest_key = f"{s3_prefix}/manifests/{voice}.json"
    
    try:
        # Fetch the completed manifest
        response = s3.get_object(Bucket=S3_BUCKET_NAME, Key=manifest_key)
        manifest = json.loads(response['Body'].read())
        
        # Inject fresh, expiring presigned URLs
        for chunk in manifest.get("chunks", []):
            chunk_key = f"{s3_prefix}/audio/{voice}/{chunk['index']}.mp3"
            chunk['url'] = s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': S3_BUCKET_NAME, 'Key': chunk_key},
                ExpiresIn=3600  # 1 hour validity
            )
        
        return manifest

    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            # This handles a voice switch. The manifest isn't ready.
            # Trigger a new background job for the requested voice.
            generate_and_save_manifest_task.delay(user_id, job_id, voice)
            raise HTTPException(
                status_code=202, # Accepted
                detail=f"Processing for voice '{voice}' has been started. Please poll the status endpoint."
            )
        else:
            raise HTTPException(status_code=500, detail=f"Storage error: {e}")

