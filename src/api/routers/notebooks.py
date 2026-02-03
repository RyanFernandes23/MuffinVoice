# src/api/routers/notebooks.py
import os
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from fastapi import (APIRouter, BackgroundTasks, Depends, File, Header,
                     HTTPException, Response, UploadFile)
from sqlmodel import Session, desc, select
from werkzeug.utils import secure_filename

from src.api.deps import (AVAILABLE_VOICES, MAX_FILE_SIZE, clerk_auth,
                          get_current_user, logger)
from src.api.schema import Note, Notebook
from src.api.utils import (get_job_status, get_session,
                           get_unique_notebook_title, process_file_task,
                           sanitize_display_filename, set_job_status)
from src.TTS_Workers.tasks import get_s3_client, process_speeches
from src.utils.RedisClient import redis_client

notebooks_router = APIRouter(prefix="/api", tags=["notebooks", "tts", "s3"])


@notebooks_router.post("/upload_file")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    voice: str = Header("af_bella", alias="voice"),
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    user_id = token_payload.decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user ID")

    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)

    # Sanitize the original filename for display and database storage
    original_filename = file.filename
    if not original_filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    sanitized_display_title = sanitize_display_filename(original_filename)

    # Get a unique title for the notebook entry in the database
    unique_db_title = get_unique_notebook_title(
        user_id, sanitized_display_title, session
    )

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
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Maximum size is {MAX_FILE_SIZE // 1024 // 1024}MB.",
                )
            f.write(chunk)

    new_notebook = Notebook(
        user_id=user_id,
        job_id=job_id,
        title=unique_db_title,  # Use the unique, sanitized title
        voice=voice,
        status="queued",
    )
    session.add(new_notebook)
    session.commit()
    set_job_status(job_id, "queued")

    background_tasks.add_task(process_file_task, user_id, job_id, str(temp_path), voice)

    logger.info(f"File uploaded for user {user_id}, job_id {job_id}")

    return {
        "message": "File uploaded. processing speech.",
        "voice": voice,
        "job_id": job_id,
    }


@notebooks_router.get("/notebooks", response_model=List[Notebook])
async def get_my_notebooks(
    token_payload=Depends(clerk_auth), session: Session = Depends(get_session)
):
    user_id = token_payload.decoded.get("sub")
    statement = (
        select(Notebook)
        .where(Notebook.user_id == user_id)
        .order_by(desc(Notebook.created_at))
    )
    return session.exec(statement).all()


@notebooks_router.delete("/notebooks/{job_id}", status_code=204)
async def delete_notebook(
    job_id: str,
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    user_id = token_payload.decoded.get("sub")

    statement = select(Notebook).where(
        Notebook.job_id == job_id, Notebook.user_id == user_id
    )
    notebook = session.exec(statement).first()

    if not notebook:
        raise HTTPException(
            status_code=404,
            detail="Notebook not found or you don't have permission to delete it.",
        )

    # 1. Delete all associated notes
    note_statement = select(Note).where(Note.job_id == job_id, Note.user_id == user_id)
    notes_to_delete = session.exec(note_statement).all()
    for note in notes_to_delete:
        session.delete(note)
    session.commit()
    logger.info(f"Deleted {len(notes_to_delete)} notes for job {job_id}.")

    # 2. Delete files from S3
    s3 = get_s3_client()
    s3_prefix = f"{user_id}/{job_id}/"
    try:
        response = s3.list_objects_v2(Bucket="ttsfiles", Prefix=s3_prefix)
        if "Contents" in response:
            objects_to_delete = [{"Key": obj["Key"]} for obj in response["Contents"]]
            s3.delete_objects(Bucket="ttsfiles", Delete={"Objects": objects_to_delete})
            logger.info(f"Deleted all files from S3 for prefix: {s3_prefix}")
    except Exception as e:
        logger.error(f"Error deleting files from S3 for prefix {s3_prefix}: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to delete associated files from storage."
        )

    # 3. Delete notebook from DB and job from Redis
    session.delete(notebook)
    session.commit()
    logger.info(f"Deleted notebook {job_id} from database.")
    redis_client.delete(f"job:{job_id}")
    logger.info(f"Deleted job {job_id} from Redis.")

    return Response(status_code=204)


@notebooks_router.get("/job_status/{job_id}")
async def job_status(job_id: str, _=Depends(clerk_auth)):
    data = get_job_status(job_id)
    if not data:
        logger.warning(f"Job ID {job_id} not found.")
        raise HTTPException(status_code=404, detail="Job ID not found.")
    return data


@notebooks_router.get("/stream/{user_id}/{job_id}/{voice}/manifest.m3u8")
async def serve_manifest(
    user_id: str, job_id: str, voice: str, token_payload=Depends(clerk_auth)
):
    if token_payload.decoded.get("sub") != user_id:
        logger.warning(
            f"Unauthorized: {token_payload.get('sub')} tried to access {user_id}"
        )
        raise HTTPException(
            status_code=403, detail="You do not have permission to view this file."
        )

    s3_prefix = f"{user_id}/{job_id}/voices/{voice}/manifest.m3u8"

    s3 = get_s3_client()
    try:
        obj = s3.get_object(Bucket="ttsfiles", Key=s3_prefix)
        content = obj["Body"].read()
        logger.info(
            f"Manifest file streamed for user {user_id}, job_id {job_id}, voice {voice}"
        )
        return Response(content, media_type="application/vnd.apple.mpegurl")
    except Exception as e:
        logger.error(
            f"Error streaming manifest file for user {user_id}, job_id {job_id}, voice {voice}: {e}"
        )
        raise HTTPException(status_code=500, detail="Error retrieving manifest file")


@notebooks_router.get("/stream/{user_id}/{job_id}/{voice}/{speech_index}")
async def serve_speech(
    user_id: str,
    job_id: str,
    voice: str,
    speech_index: str,
    token_payload=Depends(clerk_auth),
):
    if token_payload.decoded.get("sub") != user_id:
        logger.warning(
            f"Unauthorized: {token_payload.get('sub')} tried to access {user_id}"
        )
        raise HTTPException(
            status_code=403, detail="You do not have permission to view this file."
        )
    s3_prefix = f"{user_id}/{job_id}/voices/{voice}/{speech_index}"

    s3 = get_s3_client()
    try:
        obj = s3.get_object(Bucket="ttsfiles", Key=s3_prefix)
        content = obj["Body"].read()

        logger.info(
            f"Served {speech_index} for user {user_id}, job {job_id}, voice {voice}"
        )

        return Response(
            content=content,
            media_type="audio/mpeg",
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(content)),
                "Cache-Control": "public, max-age=3600",
            },
        )

    except s3.exceptions.NoSuchKey:
        logger.error(f"Audio file not found: {s3_prefix}")
        raise HTTPException(status_code=404, detail="Audio file not found")
    except Exception as e:
        logger.error(f"Error serving audio {s3_prefix}: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving audio file")


@notebooks_router.get("/stream/subtitles/{user_id}/{job_id}")
async def serve_subtitles(user_id: str, job_id: str, token_payload=Depends(clerk_auth)):
    if token_payload.decoded.get("sub") != user_id:
        logger.warning(
            f"Unauthorized: {token_payload.get('sub')} tried to access {user_id}"
        )
        raise HTTPException(
            status_code=403, detail="You do not have permission to view this file."
        )

    s3_prefix = f"{user_id}/{job_id}/subtitles.json"

    s3 = get_s3_client()
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


@notebooks_router.get("/stream/chunks/{user_id}/{job_id}")
async def serve_chunk(user_id: str, job_id: str, token_payload=Depends(clerk_auth)):
    if token_payload.decoded.get("sub") != user_id:
        logger.warning(
            f"Unauthorized: {token_payload.get('sub')} tried to access {user_id}"
        )
        raise HTTPException(
            status_code=403, detail="You do not have permission to view this file."
        )

    s3_prefix = f"{user_id}/{job_id}/chunks_c1.json"
    s3 = get_s3_client()
    try:
        obj = s3.get_object(Bucket="ttsfiles", Key=s3_prefix)
        content = obj["Body"].read()
        return Response(content, media_type="application/json")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error retrieving chunks.json")


@notebooks_router.get("/check_voice_status/{user_id}/{job_id}")
async def check_voice_status(
    user_id: str, job_id: str, token_payload=Depends(clerk_auth)
):
    """
    Lists all available voices and their processing status for a job.

    Status meanings:
    - ready: Voice folder exists with audio files (manifest.m3u8 present)
    - processing: Job is processing this voice
    - not started: Voice hasn't been processed yet for this job
    """
    if token_payload.decoded.get("sub") != user_id:
        logger.warning(
            f"Unauthorized: {token_payload.get('sub')} tried to access {user_id}"
        )
        raise HTTPException(
            status_code=403, detail="You do not have permission to view this file."
        )

    try:
        # Get job status first
        job_data = get_job_status(job_id)
        if not job_data:
            raise HTTPException(status_code=404, detail="Job not found")

        # Note: job_data is bytes in redis, but get_job_status returns a dict of bytes keys/values
        job_status = (
            job_data.get(b"status", b"unknown").decode("utf-8")
            if job_data
            else "unknown"
        )
        s3_voices_prefix = f"{user_id}/{job_id}/voices/"

        s3 = get_s3_client()
        # List all objects under the voices prefix
        response = s3.list_objects_v2(
            Bucket="ttsfiles", Prefix=s3_voices_prefix, Delimiter="/"
        )

        # Get existing voice folders from S3
        existing_voices = set()
        if "CommonPrefixes" in response:
            for prefix in response["CommonPrefixes"]:
                voice_name = prefix["Prefix"].rstrip("/").split("/")[-1]
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
                    if e.response["Error"]["Code"] == "404":
                        # Folder exists but manifest doesn't - voice is still processing
                        status = "processing"
                    else:
                        status = "processing"
            else:
                # Voice folder doesn't exist - not started yet
                status = "not started"

            voices_status.append({"name": voice, "status": status})

        logger.info(
            f"Voice status check for job {job_id}: {len(voices_status)} voices found"
        )
        return {"job_id": job_id, "job_status": job_status, "voices": voices_status}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking voice status for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail="Error checking voice status")


@notebooks_router.post("/process_voice/{user_id}/{job_id}/{voice}")
async def process_voice(
    user_id: str,
    job_id: str,
    voice: str,
    background_tasks: BackgroundTasks,
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    """
    Starts processing a specific voice for an existing job.
    This allows users to generate additional voices without re-uploading the file.
    """
    if token_payload.decoded.get("sub") != user_id:
        logger.warning(
            f"Unauthorized: {token_payload.get('sub')} tried to access {user_id}"
        )
        raise HTTPException(
            status_code=403, detail="You do not have permission to perform this action."
        )

    if voice not in AVAILABLE_VOICES:
        raise HTTPException(status_code=400, detail=f"Invalid voice: {voice}")

    try:
        # Verify the job exists and belongs to the user
        statement = select(Notebook).where(
            Notebook.job_id == job_id, Notebook.user_id == user_id
        )
        notebook = session.exec(statement).first()

        if not notebook:
            raise HTTPException(status_code=404, detail="Job not found")

        # Check if voice already exists in S3
        s3_voice_prefix = f"{user_id}/{job_id}/voices/{voice}/"
        s3 = get_s3_client()
        response = s3.list_objects_v2(
            Bucket="ttsfiles", Prefix=s3_voice_prefix, MaxKeys=1
        )

        if "Contents" in response:
            raise HTTPException(
                status_code=400,
                detail=f"Voice {voice} is already being processed or completed for this job",
            )

        # Queue the voice processing task
        background_tasks.add_task(process_speeches, user_id, job_id, voice)

        logger.info(
            f"Queued voice processing for user {user_id}, job {job_id}, voice {voice}"
        )

        return {
            "message": f"Processing started for voice {voice}",
            "job_id": job_id,
            "voice": voice,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing voice {voice} for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail="Error starting voice processing")