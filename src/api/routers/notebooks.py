# src/api/routers/notebooks.py
import asyncio
import json
import os
import time
from pathlib import Path
from typing import AsyncGenerator, List, Optional
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Header,
    HTTPException,
    Response,
    UploadFile,
)
from fastapi.responses import StreamingResponse
from sqlmodel import Session, desc, select
from werkzeug.utils import secure_filename

from src.api.deps import (
    AVAILABLE_VOICES,
    MAX_FILE_SIZE,
    clerk_auth,
    get_current_user,
    logger,
)
from src.api.schema import Note, Notebook
from src.api.utils import (
    calculate_text_tokens,
    check_token_availability,
    deduct_tokens,
    engine,
    get_job_status,
    get_session,
    get_unique_notebook_title,
    process_file_task,
    sanitize_display_filename,
    set_job_status,
)
from src.TextExtractor.web_extractor import WebpageExtractor
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

    # Read file content and estimate tokens BEFORE saving
    total_size = 0
    file_content = b""

    while chunk := await file.read(1024 * 1024):
        total_size += len(chunk)
        if total_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE // 1024 // 1024}MB.",
            )
        file_content += chunk

    # Estimate tokens from file content (character count)
    try:
        estimated_tokens = calculate_text_tokens(file_content.decode("utf-8"))
    except UnicodeDecodeError:
        estimated_tokens = len(file_content)  # Fallback to byte count

    # Check token availability
    has_sufficient, available_tokens = check_token_availability(
        session, user_id, estimated_tokens
    )
    if not has_sufficient:
        raise HTTPException(
            status_code=402,  # Payment Required
            detail=f"Insufficient tokens. Required: {estimated_tokens}, Available: {available_tokens}. Please upgrade your plan.",
        )

    # Deduct tokens optimistically
    if not deduct_tokens(session, user_id, estimated_tokens, job_id):
        raise HTTPException(
            status_code=402, detail="Failed to deduct tokens. Please try again."
        )

    # Save file to disk after token check passes
    with open(temp_path, "wb") as f:
        f.write(file_content)

    new_notebook = Notebook(
        user_id=user_id,
        job_id=job_id,
        title=unique_db_title,  # Use the unique, sanitized title
        voice=voice,
        status="queued",
        tokens_requested=estimated_tokens,  # Track requested tokens
        tokens_used=0,  # Will be updated during processing
    )
    session.add(new_notebook)
    session.commit()
    set_job_status(job_id, "queued")

    background_tasks.add_task(process_file_task, user_id, job_id, str(temp_path), voice)

    logger.info(
        f"File uploaded for user {user_id}, job_id {job_id}, tokens_requested: {estimated_tokens}"
    )

    return {
        "message": "File uploaded. processing speech.",
        "voice": voice,
        "job_id": job_id,
        "tokens_deducted": estimated_tokens,
    }


@notebooks_router.post("/upload_webpage")
async def upload_webpage(
    background_tasks: BackgroundTasks,
    url: str = Header(..., alias="url"),
    voice: str = Header("af_bella", alias="voice"),
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    """
    Extract text from a webpage URL and process it for TTS.

    Headers:
        url: The webpage URL to extract from (required)
        voice: Voice to use for TTS (default: af_bella)
    """
    user_id = token_payload.decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user ID")

    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    # Validate URL format
    try:
        from urllib.parse import urlparse

        parsed = urlparse(url)
        if not all([parsed.scheme in ["http", "https"], parsed.netloc]):
            raise HTTPException(status_code=400, detail="Invalid URL format")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid URL format")

    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)

    job_id = str(uuid4())

    # Create webpage extractor
    extractor = WebpageExtractor(url)

    # Extract text from webpage (use dynamic loading by default for better compatibility)
    try:
        extracted_text = await extractor.extract(
            use_dynamic=True,  # Always use dynamic loading for better JS site support
            css_selector=None,  # No custom selector, use auto-detection
            timeout=30,
        )
    except TimeoutError as e:
        raise HTTPException(status_code=408, detail=f"Request timeout: {str(e)}")
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Cannot access webpage: {str(e)}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error extracting from {url}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to extract content: {str(e)}"
        )

    # Check if content was extracted
    if not extracted_text or len(extracted_text.strip()) < 50:
        raise HTTPException(
            status_code=422,
            detail="Could not extract meaningful content from the webpage. The page might be protected or have no readable content.",
        )

    # Estimate tokens
    estimated_tokens = calculate_text_tokens(extracted_text)

    # Check token availability
    has_sufficient, available_tokens = check_token_availability(
        session, user_id, estimated_tokens
    )
    if not has_sufficient:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient tokens. Required: {estimated_tokens}, Available: {available_tokens}. Please upgrade your plan.",
        )

    # Deduct tokens optimistically
    if not deduct_tokens(session, user_id, estimated_tokens, job_id):
        raise HTTPException(
            status_code=402, detail="Failed to deduct tokens. Please try again."
        )

    # Save extracted text to file
    temp_path = extractor.save_to_file(extracted_text, str(upload_dir))

    # Create title from URL domain
    domain = parsed.netloc.replace("www.", "")
    base_title = f"Webpage: {domain}"
    unique_db_title = get_unique_notebook_title(user_id, base_title, session)

    # Create notebook entry
    new_notebook = Notebook(
        user_id=user_id,
        job_id=job_id,
        title=unique_db_title,
        voice=voice,
        status="queued",
        tokens_requested=estimated_tokens,
        tokens_used=0,
        source_url=url,  # Store the source URL
    )
    session.add(new_notebook)
    session.commit()
    set_job_status(job_id, "queued")

    # Process the extracted text
    background_tasks.add_task(process_file_task, user_id, job_id, temp_path, voice)

    logger.info(
        f"Webpage uploaded for user {user_id}, job_id {job_id}, url: {url}, tokens_requested: {estimated_tokens}"
    )

    return {
        "message": "Webpage content extracted and processing started.",
        "voice": voice,
        "job_id": job_id,
        "tokens_deducted": estimated_tokens,
        "extracted_chars": len(extracted_text),
        "source_url": url,
    }


@notebooks_router.post("/upload_text")
async def upload_text(
    background_tasks: BackgroundTasks,
    request: dict,
    voice: str = Header("af_bella", alias="voice"),
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    """
    Upload text content directly and process it for TTS.

    Request body:
        text: The text content to convert (required)
        title: Optional custom title for the notebook

    Headers:
        voice: Voice to use for TTS (default: af_bella)
    """
    user_id = token_payload.decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user ID")

    # Extract text and title from request
    text = request.get("text", "")
    custom_title = request.get("title", "").strip()

    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text content is required")

    text = text.strip()

    # Calculate tokens from character count
    estimated_tokens = calculate_text_tokens(text)

    # Check token availability
    has_sufficient, available_tokens = check_token_availability(
        session, user_id, estimated_tokens
    )
    if not has_sufficient:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient tokens. Required: {estimated_tokens}, Available: {available_tokens}. Please upgrade your plan.",
        )

    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)

    job_id = str(uuid4())

    # Deduct tokens optimistically
    if not deduct_tokens(session, user_id, estimated_tokens, job_id):
        raise HTTPException(
            status_code=402, detail="Failed to deduct tokens. Please try again."
        )

    # Save text to file
    timestamp = int(time.time())
    filename = f"text_input_{timestamp}.txt"
    temp_path = upload_dir / filename

    with open(temp_path, "w", encoding="utf-8") as f:
        f.write(text)

    # Generate title
    if custom_title:
        base_title = custom_title
    else:
        # Use first line or first 50 characters
        first_line = text.split("\n")[0].strip()
        if len(first_line) > 50:
            base_title = first_line[:50] + "..."
        elif first_line:
            base_title = first_line
        else:
            from datetime import datetime

            base_title = f"Text Input - {datetime.now().strftime('%b %d, %Y')}"

    unique_db_title = get_unique_notebook_title(user_id, base_title, session)

    # Create notebook entry
    new_notebook = Notebook(
        user_id=user_id,
        job_id=job_id,
        title=unique_db_title,
        voice=voice,
        status="queued",
        tokens_requested=estimated_tokens,
        tokens_used=0,
        source_url=None,
    )
    session.add(new_notebook)
    session.commit()
    set_job_status(job_id, "queued")

    # Process the text
    background_tasks.add_task(process_file_task, user_id, job_id, str(temp_path), voice)

    logger.info(
        f"Text uploaded for user {user_id}, job_id {job_id}, tokens_requested: {estimated_tokens}"
    )

    return {
        "message": "Text uploaded and processing started.",
        "voice": voice,
        "job_id": job_id,
        "tokens_deducted": estimated_tokens,
        "char_count": len(text),
        "title": unique_db_title,
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

    notebook_user_id = notebook.user_id

    s3 = get_s3_client()
    s3_prefix = f"{notebook_user_id}/{job_id}/"
    try:
        response = s3.list_objects_v2(Bucket="ttsfiles", Prefix=s3_prefix)
        if "Contents" in response:
            objects_to_delete = [{"Key": obj["Key"]} for obj in response["Contents"]]
            s3.delete_objects(Bucket="ttsfiles", Delete={"Objects": objects_to_delete})
            logger.info(
                f"Deleted {len(objects_to_delete)} objects from S3: {s3_prefix}"
            )
        else:
            logger.info(f"No S3 objects found for prefix: {s3_prefix}")
    except Exception as e:
        logger.error(f"S3 deletion failed for {s3_prefix}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete files from storage: {str(e)}",
        )

    try:
        redis_client.delete(f"job:{job_id}")
        logger.info(f"Deleted Redis key: job:{job_id}")
    except Exception as e:
        logger.error(f"Redis deletion failed for job {job_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete job from cache: {str(e)}",
        )

    try:
        from sqlmodel import delete

        result = session.execute(delete(Note).where(Note.job_id == job_id))
        notes_deleted = result.rowcount
        logger.info(f"Bulk deleted {notes_deleted} notes for job {job_id}")
    except Exception as e:
        logger.error(f"Note deletion failed for job {job_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete associated notes: {str(e)}",
        )

    try:
        session.delete(notebook)
        session.commit()
        logger.info(f"Deleted notebook {job_id} from database")
    except Exception as e:
        session.rollback()
        logger.error(f"Notebook deletion failed for {job_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete notebook: {str(e)}",
        )

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


async def get_all_voices_status(user_id: str, job_id: str) -> dict:
    """
    Helper function to get current status of all voices for a job.
    Returns a dict with voices list and job_status.
    """
    try:
        job_data = get_job_status(job_id)
        if not job_data:
            return {"job_id": job_id, "job_status": "unknown", "voices": []}

        job_status = (
            job_data.get(b"status", b"unknown").decode("utf-8")
            if isinstance(job_data, dict)
            else "unknown"
        )
        s3_voices_prefix = f"{user_id}/{job_id}/voices/"

        s3 = get_s3_client()
        response = s3.list_objects_v2(
            Bucket="ttsfiles", Prefix=s3_voices_prefix, Delimiter="/"
        )

        existing_voices = set()
        if "CommonPrefixes" in response:
            for prefix in response["CommonPrefixes"]:
                voice_name = prefix["Prefix"].rstrip("/").split("/")[-1]
                existing_voices.add(voice_name)

        voices_status = []
        for voice in AVAILABLE_VOICES:
            if voice in existing_voices:
                voice_prefix = f"{s3_voices_prefix}{voice}/"
                manifest_key = f"{voice_prefix}manifest.m3u8"

                try:
                    s3.head_object(Bucket="ttsfiles", Key=manifest_key)
                    status = "ready"
                except s3.exceptions.ClientError as e:
                    if e.response["Error"]["Code"] == "404":
                        status = "processing"
                    else:
                        status = "processing"
            else:
                status = "not started"

            voices_status.append({"name": voice, "status": status})

        return {"job_id": job_id, "job_status": job_status, "voices": voices_status}
    except Exception as e:
        logger.error(f"Error getting voice status for job {job_id}: {e}")
        return {"job_id": job_id, "job_status": "error", "voices": []}


@notebooks_router.get("/voice_status_stream/{user_id}/{job_id}")
async def voice_status_stream(
    user_id: str, job_id: str, token_payload=Depends(clerk_auth)
):
    """
    SSE endpoint for real-time voice status updates.
    Streams voice status changes as they happen via Redis pub/sub.
    Includes automatic fallback support header for clients.
    """
    if token_payload.decoded.get("sub") != user_id:
        logger.warning(
            f"Unauthorized SSE attempt: {token_payload.decoded.get('sub')} tried to access {user_id}"
        )
        raise HTTPException(
            status_code=403, detail="You do not have permission to view this stream."
        )

    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate SSE events with voice status updates."""
        pubsub = None
        try:
            # Create pub/sub connection
            pubsub = redis_client.pubsub()
            channel = f"voice_status:{job_id}"
            pubsub.subscribe(channel)

            # Send initial status immediately
            initial_status = await get_all_voices_status(user_id, job_id)
            yield f"data: {json.dumps(initial_status)}\n\n"

            # Listen for updates with timeout
            while True:
                try:
                    # Wait for message with 30 second timeout (heartbeat)
                    message = await asyncio.wait_for(
                        asyncio.to_thread(pubsub.get_message, timeout=1.0), timeout=30.0
                    )

                    if message and message["type"] == "message":
                        # Parse the voice status update
                        try:
                            update_data = json.loads(message["data"])
                            # Get fresh full status after update
                            full_status = await get_all_voices_status(user_id, job_id)
                            yield f"data: {json.dumps(full_status)}\n\n"
                        except json.JSONDecodeError:
                            logger.warning(
                                f"Invalid JSON in voice status message: {message['data']}"
                            )

                except asyncio.TimeoutError:
                    # Send heartbeat to keep connection alive
                    yield ":heartbeat\n\n"

        except asyncio.CancelledError:
            logger.info(f"SSE connection cancelled for job {job_id}")
            raise
        except Exception as e:
            logger.error(f"SSE error for job {job_id}: {e}")
            # Send error event before closing
            error_data = {"error": "Stream error", "message": str(e)}
            yield f"data: {json.dumps(error_data)}\n\n"
        finally:
            if pubsub:
                pubsub.unsubscribe()
                pubsub.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
        },
    )


async def get_active_notebooks(user_id: str) -> list:
    """
    Get all active (queued/processing) notebooks for a user.
    """
    with Session(engine) as session:
        statement = (
            select(Notebook)
            .where(
                Notebook.user_id == user_id,
                Notebook.status.in_(["queued", "processing"]),
            )
            .order_by(desc(Notebook.created_at))
        )
        notebooks = session.exec(statement).all()
        return [
            {
                "job_id": nb.job_id,
                "title": nb.title,
                "voice": nb.voice,
                "status": nb.status,
                "created_at": nb.created_at.isoformat() if nb.created_at else None,
                "tokens_used": nb.tokens_used,
            }
            for nb in notebooks
        ]


@notebooks_router.get("/notebook_status_stream/{user_id}")
async def notebook_status_stream(user_id: str, token_payload=Depends(clerk_auth)):
    """
    SSE endpoint for real-time notebook status updates.
    Streams only active notebooks (queued/processing).
    Sends 'all_complete' event and closes when no active notebooks remain.
    """
    if token_payload.decoded.get("sub") != user_id:
        logger.warning(
            f"Unauthorized SSE attempt: {token_payload.decoded.get('sub')} tried to access {user_id}"
        )
        raise HTTPException(
            status_code=403, detail="You do not have permission to view this stream."
        )

    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate SSE events with notebook status updates."""
        pubsub = None
        try:
            # Create pub/sub connection
            pubsub = redis_client.pubsub()
            channel = f"notebook_status:{user_id}"
            pubsub.subscribe(channel)

            # Get initial active notebooks
            active_notebooks = await get_active_notebooks(user_id)

            # If no active notebooks initially, send all_complete and close
            if not active_notebooks:
                yield f"data: {json.dumps({'type': 'all_complete', 'notebooks': []})}\n\n"
                return

            # Send initial data
            yield f"data: {json.dumps({'type': 'active_notebooks', 'notebooks': active_notebooks})}\n\n"

            # Track active job IDs
            active_job_ids = {nb["job_id"] for nb in active_notebooks}
            consecutive_empty_polls = 0
            max_empty_polls = 2  # Check twice before closing

            # Listen for updates
            while True:
                try:
                    # Wait for message with 30 second timeout (heartbeat)
                    message = await asyncio.wait_for(
                        asyncio.to_thread(pubsub.get_message, timeout=1.0), timeout=30.0
                    )

                    if message and message["type"] == "message":
                        # A status update was published, refresh active list
                        active_notebooks = await get_active_notebooks(user_id)

                        # Update tracking
                        new_active_ids = {nb["job_id"] for nb in active_notebooks}

                        # Check if any jobs transitioned from active to complete/failed
                        completed_jobs = active_job_ids - new_active_ids

                        if completed_jobs:
                            # Send update with the completed job info
                            yield f"data: {json.dumps({'type': 'status_update', 'notebooks': active_notebooks})}\n\n"

                            # Update tracking set
                            active_job_ids = new_active_ids

                            # Check if all complete
                            if not active_job_ids:
                                consecutive_empty_polls += 1
                                if consecutive_empty_polls >= max_empty_polls:
                                    # Verify once more before closing
                                    final_check = await get_active_notebooks(user_id)
                                    if not final_check:
                                        yield f"data: {json.dumps({'type': 'all_complete', 'notebooks': []})}\n\n"
                                        break
                                    else:
                                        # Race condition - new active jobs appeared
                                        active_job_ids = {
                                            nb["job_id"] for nb in final_check
                                        }
                                        consecutive_empty_polls = 0
                                else:
                                    # First empty poll, wait for next message to confirm
                                    pass
                            else:
                                consecutive_empty_polls = 0
                        else:
                            # No change in active set, but send update anyway (could be new queued job)
                            if new_active_ids - active_job_ids:
                                # New jobs added
                                active_job_ids = new_active_ids
                                yield f"data: {json.dumps({'type': 'status_update', 'notebooks': active_notebooks})}\n\n"
                                consecutive_empty_polls = 0

                except asyncio.TimeoutError:
                    # Send heartbeat to keep connection alive
                    yield ":heartbeat\n\n"

                    # Periodic check - query database to catch any missed updates
                    active_notebooks = await get_active_notebooks(user_id)

                    new_active_ids = {nb["job_id"] for nb in active_notebooks}

                    # If status changed, send update
                    if new_active_ids != active_job_ids:
                        active_job_ids = new_active_ids
                        if active_job_ids:
                            yield f"data: {json.dumps({'type': 'status_update', 'notebooks': active_notebooks})}\n\n"
                        else:
                            consecutive_empty_polls += 1
                            if consecutive_empty_polls >= max_empty_polls:
                                yield f"data: {json.dumps({'type': 'all_complete', 'notebooks': []})}\n\n"
                                break

        except asyncio.CancelledError:
            logger.info(f"Notebook SSE connection cancelled for user {user_id}")
            raise
        except Exception as e:
            logger.error(f"Notebook SSE error for user {user_id}: {e}")
            error_data = {"type": "error", "error": "Stream error", "message": str(e)}
            yield f"data: {json.dumps(error_data)}\n\n"
        finally:
            if pubsub:
                pubsub.unsubscribe()
                pubsub.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
