from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from werkzeug.utils import secure_filename
from pathlib import Path
from uuid import uuid4
from src.TTS_Workers.tasks import process_file_task,process_speeches,get_s3_client  # Ensure actor name matches
import redis
import os
from fastapi.responses import FileResponse,Response


# for job status update
redis_client = redis.StrictRedis(host="localhost", port=6379, db=0, decode_responses=True)

def set_job_status(job_id: str, status: str, extra: dict = None):
    data = {"status": status}
    if extra:
        data.update(extra)
    redis_client.hmset(f"job:{job_id}", data)

def get_job_status(job_id: str):
    return redis_client.hgetall(f"job:{job_id}")
app = FastAPI(title="TTS API with Dramatiq")

@app.post("/upload_file")
async def upload_file(
    file: UploadFile = File(...),
    user_id: str = Header(..., alias="X-User-ID"),
    voice: str = "af_bella"
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
    process_file_task.send(user_id,job_id,str(temp_path),voice)

    return {
        "message": "File uploaded. processing speech.",
        "voice": voice,
        "job_id": job_id
    }

@app.get("/job_status/{job_id}")
async def job_status(job_id: str):
    data = get_job_status(job_id)
    if not data:
        raise HTTPException(status_code=404, detail="Job ID not found.")
    return data

@app.get("/stream/{user_id}/{job_id}/{voice}/manifest.m3u8")
async def serve_manifest(user_id: str, job_id: str, voice: str):
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}/voices/{voice}/manifest.m3u8"
    
    # Download manifest temporarily
    obj = s3.get_object(Bucket="ttsfiles", Key=s3_prefix)
    content = obj["Body"].read()

    return Response(content, media_type="application/vnd.apple.mpegurl")