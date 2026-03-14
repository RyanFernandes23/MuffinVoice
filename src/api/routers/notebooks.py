# src/api/routers/notebooks.py
import asyncio
import json
import os
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import AsyncGenerator, List, Optional
from uuid import uuid4
from pydantic import BaseModel

class JobStatusRequest(BaseModel):
    job_ids: List[str]

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
    clerk_auth_optional,
    get_current_user,
    get_current_admin,
    logger,
)
from src.api.schema import Note, Notebook, NotebookRead
from src.api.token_utils import refund_tokens
from src.api.utils import (
    calculate_text_tokens,
    check_token_availability,
    deduct_tokens,
    engine,
    get_job_status,
    get_batch_job_statuses,
    get_session,
    get_unique_notebook_title,
    prune_old_uploads,
    sanitize_display_filename,
    set_job_status,
)
from src.workers.worker import (
    process_file_task, 
    get_s3_client, 
    process_speeches, 
    cleanup_notebook_resources
)
from src.TextExtractor.web_extractor import WebpageExtractor
from src.utils.RedisClient import redis_client

notebooks_router = APIRouter(prefix="/api", tags=["notebooks", "tts", "s3"])

STALE_JOB_TIMEOUT_MINUTES = 10


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
    prune_old_uploads() # Fail-safe cleanup

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

    # Production Scaling: Save file to S3 'uploads/' prefix instead of local disk
    # This allows any worker in a cluster to pick up the job and ensures statelessness
    s3 = get_s3_client()
    s3_key = f"uploads/{job_id}-{safe_disk_filename}"
    try:
        s3.put_object(Bucket="ttsfiles", Key=s3_key, Body=file_content)
        logger.info(f"Uploaded source file to S3: {s3_key}")
    except Exception as e:
        logger.error(f"Failed to upload source file to S3: {e}")
        # Rollback token deduction if possible
        refund_tokens(session, user_id, estimated_tokens, job_id)
        raise HTTPException(status_code=500, detail="Storage backend failure")

    new_notebook = Notebook(
        user_id=user_id,
        job_id=job_id,
        title=unique_db_title,
        voice=voice,
        status="queued",
        tokens_requested=estimated_tokens,
        tokens_used=0,
    )
    session.add(new_notebook)
    session.commit()
    set_job_status(job_id, "queued")

    # Pass the S3 key instead of a local temp path
    process_file_task.send(user_id, job_id, s3_key, voice)

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
    prune_old_uploads() # Fail-safe cleanup

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

    # Save extracted text to S3 'uploads/' prefix for stateless processing
    s3 = get_s3_client()
    s3_key = f"uploads/{job_id}_webpage.txt"
    try:
        text_to_save = str(extracted_text).strip()
        s3.put_object(Bucket="ttsfiles", Key=s3_key, Body=text_to_save.encode("utf-8"))
        logger.info(f"Uploaded webpage text to S3: {s3_key}")
    except Exception as e:
        logger.error(f"Failed to upload webpage text to S3: {e}")
        refund_tokens(session, user_id, estimated_tokens, job_id)
        raise HTTPException(status_code=500, detail="Storage backend failure")

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
        source_url=url,
    )
    session.add(new_notebook)
    session.commit()
    set_job_status(job_id, "queued")

    process_file_task.send(user_id, job_id, s3_key, voice)

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
    process_file_task.send(user_id, job_id, str(temp_path), voice)

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


@notebooks_router.get("/notebooks", response_model=List[NotebookRead])
async def get_my_notebooks(
    token_payload=Depends(clerk_auth), session: Session = Depends(get_session)
):
    user_id = token_payload.decoded.get("sub")
    statement = (
        select(Notebook)
        .where(Notebook.user_id == user_id)
        .order_by(desc(Notebook.created_at))
    )
    notebooks = session.exec(statement).all()
    # Scalable Enrichment: Batch fetch all statuses in ONE Redis round-trip
    job_voice_pairs = [(nb.job_id, nb.voice) for nb in notebooks]
    all_job_stats = get_batch_job_statuses(job_voice_pairs)
    
    result = []
    for nb in notebooks:
        nb_read = NotebookRead.model_validate(nb)
        key = f"{nb.job_id}:{nb.voice}"
        job_info = all_job_stats.get(key, {})
        
        if job_info:
            nb_read.progress_percent = int(job_info.get("progress_percent", 0))
            if job_info.get("status"):
                nb_read.status = job_info["status"]
                
        result.append(nb_read)
    return result


@notebooks_router.get("/public_notebooks", response_model=List[Notebook])
async def get_public_notebooks(session: Session = Depends(get_session)):
    """
    Returns all notebooks marked as public/free and completed.
    """
    statement = (
        select(Notebook)
        .where(Notebook.is_public == True, Notebook.status == "completed")
        .order_by(desc(Notebook.created_at))
    )
    return session.exec(statement).all()


@notebooks_router.get("/admin/notebooks", response_model=List[Notebook])
async def admin_get_all_notebooks(
    session: Session = Depends(get_session),
    admin_id: str = Depends(get_current_admin)
):
    """
    Returns all notebooks in the system. Admin Only.
    """
    statement = select(Notebook).order_by(desc(Notebook.created_at))
    return session.exec(statement).all()


@notebooks_router.post("/admin/notebooks/{job_id}/toggle_public", response_model=Notebook)
async def admin_toggle_public(
    job_id: str,
    session: Session = Depends(get_session),
    admin_id: str = Depends(get_current_admin)
):
    """
    Toggles the public status of a notebook. Admin Only.
    """
    statement = select(Notebook).where(Notebook.job_id == job_id)
    notebook = session.exec(statement).first()
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    notebook.is_public = not notebook.is_public
    session.add(notebook)
    session.commit()
    session.refresh(notebook)
    return notebook


@notebooks_router.delete("/admin/notebooks/{job_id}", status_code=204)
async def admin_delete_notebook(
    job_id: str,
    session: Session = Depends(get_session),
    admin_id: str = Depends(get_current_admin)
):
    """
    Deletes any notebook. Admin Only.
    """
    statement = select(Notebook).where(Notebook.job_id == job_id)
    notebook = session.exec(statement).first()
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    notebook_user_id = notebook.user_id

    s3 = get_s3_client()
    try:
        # Delete S3 artifacts
        s3.delete_object(Bucket="ttsfiles", Key=f"{notebook_user_id}/{job_id}/manifest.m3u8")
        s3.delete_object(Bucket="ttsfiles", Key=f"{notebook_user_id}/{job_id}/subtitles.json")
    except Exception as e:
        logger.warning(f"Error deleting S3 objects for {job_id}: {e}")

    session.delete(notebook)
    session.commit()
    return


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

    if notebook.is_public:
        raise HTTPException(
            status_code=403,
            detail="Public notebooks cannot be deleted.",
        )

    # 1. STOP PROCESSING: Set cancellation flag immediately
    try:
        redis_client.setex(f"cancelled:{job_id}", 600, "1")
        logger.info(f"Cancellation flag set for job: {job_id}")
    except Exception as e:
        logger.warning(f"Failed to set cancellation flag for {job_id}: {e}")

    # 2. PARTIAL REFUND: Only refund what hasn't been turned into audio yet
    # This protects us from users deleting a job after listening to most of it
    try:
        # Get real-time consumed tokens from Redis
        consumed = redis_client.hget(f"job:{job_id}", "consumed_tokens")
        consumed_val = int(consumed) if consumed else 0
        
        refund_amount = notebook.tokens_requested - consumed_val
        if refund_amount > 0:
            refund_tokens(session, user_id, refund_amount, job_id)
            logger.info(f"[PARTIAL_REFUND] Refunded {refund_amount} tokens for {job_id} (Consumed: {consumed_val})")
    except Exception as e:
        logger.error(f"Partial token refund failed for {job_id}: {e}")
        # Safe fallback: full refund if tracking fails
        # refund_tokens(session, user_id, notebook.tokens_requested, job_id)

    # 3. BACKGROUND DEEP CLEANUP: Move slow S3/Redis flushing to a worker
    # This prevents API timeouts on large notebooks
    cleanup_notebook_resources.send(user_id, job_id)

    # 4. DATABASE RECORDS: Delete immediately to update UI
    try:
        from sqlmodel import delete
        session.execute(delete(Note).where(Note.job_id == job_id))
        session.delete(notebook)
        session.commit()
        logger.info(f"UI Clean: Deleted notebook {job_id} from DB")
    except Exception as e:
        session.rollback()
        logger.error(f"DB deletion failed for {job_id}: {e}")
        raise HTTPException(status_code=500, detail="Cleanup failed at database level")

    return Response(status_code=204)


@notebooks_router.get("/job_status/{job_id}")
async def job_status(job_id: str, _=Depends(clerk_auth)):
    status_data = get_job_status(job_id)
    if not status_data:
        logger.warning(f"Job ID {job_id} not found.")
        raise HTTPException(status_code=404, detail="Job ID not found.")
    
    # Convert redis bytes to strings for JSON serializability
    result = {k.decode("utf-8") if isinstance(k, bytes) else k: v.decode("utf-8") if isinstance(v, bytes) else v for k, v in status_data.items()}
    return result


@notebooks_router.get("/stream/{user_id}/{job_id}/{voice}/manifest.m3u8")
async def serve_manifest(
    user_id: str,
    job_id: str,
    voice: str,
    token_payload=Depends(clerk_auth_optional),
    session: Session = Depends(get_session),
):
    # Check if notebook is public
    statement = select(Notebook).where(Notebook.job_id == job_id)
    notebook = session.exec(statement).first()

    is_authorized = False
    if notebook and notebook.is_public:
        is_authorized = True
    elif token_payload and token_payload.decoded.get("sub") == user_id:
        is_authorized = True

    if not is_authorized:
        logger.warning(
            f"Unauthorized: {token_payload.decoded.get('sub') if token_payload else 'Guest'} tried to access {user_id}"
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
    token_payload=Depends(clerk_auth_optional),
    session: Session = Depends(get_session),
):
    # Check if notebook is public
    statement = select(Notebook).where(Notebook.job_id == job_id)
    notebook = session.exec(statement).first()

    is_authorized = False
    if notebook and notebook.is_public:
        is_authorized = True
    elif token_payload and token_payload.decoded.get("sub") == user_id:
        is_authorized = True

    if not is_authorized:
        logger.warning(
            f"Unauthorized: {token_payload.decoded.get('sub') if token_payload else 'Guest'} tried to access {user_id}"
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
async def serve_subtitles(
    user_id: str,
    job_id: str,
    token_payload=Depends(clerk_auth_optional),
    session: Session = Depends(get_session),
):
    # Check if notebook is public
    statement = select(Notebook).where(Notebook.job_id == job_id)
    notebook = session.exec(statement).first()

    is_authorized = False
    if notebook and notebook.is_public:
        is_authorized = True
    elif token_payload and token_payload.decoded.get("sub") == user_id:
        is_authorized = True

    if not is_authorized:
        logger.warning(
            f"Unauthorized: {token_payload.decoded.get('sub') if token_payload else 'Guest'} tried to access {user_id}"
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
async def serve_chunk(
    user_id: str,
    job_id: str,
    token_payload=Depends(clerk_auth_optional),
    session: Session = Depends(get_session),
):
    # Check if notebook is public
    statement = select(Notebook).where(Notebook.job_id == job_id)
    notebook = session.exec(statement).first()

    is_authorized = False
    if notebook and notebook.is_public:
        is_authorized = True
    elif token_payload and token_payload.decoded.get("sub") == user_id:
        is_authorized = True

    if not is_authorized:
        logger.warning(
            f"Unauthorized: {token_payload.decoded.get('sub') if token_payload else 'Guest'} tried to access {user_id}"
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

        # Note: job_data is used to get the general job status
        job_status = job_data.get("status", "unknown")
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

        # Scalable Voice Enrichment: Fetch progress for all available voices in one trip
        voice_pairs = [(job_id, v) for v in AVAILABLE_VOICES]
        all_voice_stats = get_batch_job_statuses(voice_pairs)

        voices_status = []
        for voice in AVAILABLE_VOICES:
            # Use the correctly keyed batch data
            voice_data = all_voice_stats.get(f"{job_id}:{voice}", {})
            v_progress = int(voice_data.get("progress_percent", 0))
            v_status = voice_data.get("status", "not started")

            if voice in existing_voices:
                # S3 Check for finality
                voice_prefix = f"{s3_voices_prefix}{voice}/"
                manifest_key = f"{voice_prefix}manifest.m3u8"
                try:
                    s3.head_object(Bucket="ttsfiles", Key=manifest_key)
                    status = "ready"
                    v_progress = 100
                except:
                    status = "processing" if v_status == "processing" else "ready"
            else:
                status = "processing" if v_status == "processing" else "not started"

            voices_status.append({
                "name": voice, 
                "status": status,
                "progress_percent": v_progress
            })

        # Overall job progress (from primary voice or job key)
        progress_percent = int(job_data.get("progress_percent", "0"))
        # Fix the bytes/string key bug for job_status
        job_status_display = job_data.get("status", "unknown")
        
        return {
            "job_id": job_id, 
            "job_status": job_status_display, 
            "progress_percent": progress_percent,
            "voices": voices_status
        }

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
        process_speeches.send(user_id, job_id, voice)

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


@notebooks_router.post("/check_job_statuses")
async def check_job_statuses(
    request: JobStatusRequest,
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session)
):
    """
    Batch status endpoint for job-specific polling.
    Accepts a list of job IDs and returns their current statuses.
    """
    user_id = token_payload.decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    statement = select(Notebook).where(
        Notebook.user_id == user_id,
        Notebook.job_id.in_(request.job_ids)
    )
    notebooks = session.exec(statement).all()
    # Scalable Enrichment: Batch fetch statuses for all requested job IDs (main voice)
    # Note: We should ideally pass the actual voice from the DB results
    job_voice_pairs = [(nb.job_id, nb.voice) for nb in notebooks]
    all_job_stats = get_batch_job_statuses(job_voice_pairs)
    
    response_data = []
    for nb in notebooks:
        key = f"{nb.job_id}:{nb.voice}"
        job_info = all_job_stats.get(key, {})
        
        item = {
            "user_id": nb.user_id,
            "job_id": nb.job_id,
            "title": nb.title,
            "voice": nb.voice,
            "status": nb.status,
            "created_at": nb.created_at.isoformat() if nb.created_at else None,
            "tokens_used": nb.tokens_used,
            "source_url": nb.source_url,
            "progress_percent": 0
        }
        
        if job_info:
            item["progress_percent"] = int(job_info.get("progress_percent", 0))
            if job_info.get("status"):
                item["status"] = job_info["status"]
                
        response_data.append(item)

    return {"notebooks": response_data}


@notebooks_router.post("/cleanup_stale_jobs")
async def cleanup_stale_jobs(
    token_payload=Depends(clerk_auth),
    session: Session = Depends(get_session),
):
    """
    Detects and cleans up notebooks stuck in 'processing' or 'queued'
    for more than STALE_JOB_TIMEOUT_MINUTES. Refunds tokens, deletes
    S3 objects, Redis keys, notes, and DB rows.

    Called automatically by the frontend on page load (self-healing),
    or manually for admin cleanup.
    """
    user_id = token_payload.decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user ID")

    cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=STALE_JOB_TIMEOUT_MINUTES)

    # Find stale notebooks for this user
    statement = select(Notebook).where(
        Notebook.user_id == user_id,
        Notebook.status.in_(["processing", "queued"]),
        Notebook.created_at < cutoff_time,
    )
    stale_notebooks = session.exec(statement).all()

    if not stale_notebooks:
        return {"cleaned": 0, "jobs": []}

    cleaned_jobs = []
    s3 = get_s3_client()

    for notebook in stale_notebooks:
        job_id = notebook.job_id
        try:
            # 1. Refund tokens
            if notebook.tokens_requested and notebook.tokens_requested > 0:
                try:
                    refund_tokens(
                        session=session,
                        user_id=user_id,
                        amount=notebook.tokens_requested,
                        notebook_id=job_id,
                    )
                    logger.info(
                        f"[CLEANUP] Refunded {notebook.tokens_requested} tokens for stale job {job_id}"
                    )
                except Exception as e:
                    logger.error(f"[CLEANUP] Token refund failed for {job_id}: {e}")

            # 2. Delete S3 objects
            s3_prefix = f"{user_id}/{job_id}/"
            try:
                response = s3.list_objects_v2(Bucket="ttsfiles", Prefix=s3_prefix)
                if "Contents" in response:
                    objects_to_delete = [{"Key": obj["Key"]} for obj in response["Contents"]]
                    s3.delete_objects(Bucket="ttsfiles", Delete={"Objects": objects_to_delete})
                    logger.info(f"[CLEANUP] Deleted {len(objects_to_delete)} S3 objects for {job_id}")
            except Exception as e:
                logger.error(f"[CLEANUP] S3 cleanup failed for {job_id}: {e}")

            # 3. Delete Redis key
            try:
                redis_client.delete(f"job:{job_id}")
            except Exception as e:
                logger.error(f"[CLEANUP] Redis cleanup failed for {job_id}: {e}")

            # 4. Delete associated notes
            try:
                from sqlmodel import delete as sql_delete
                session.execute(sql_delete(Note).where(Note.job_id == job_id))
            except Exception as e:
                logger.error(f"[CLEANUP] Note deletion failed for {job_id}: {e}")

            # 5. Delete notebook from DB
            session.delete(notebook)

            cleaned_jobs.append({
                "job_id": job_id,
                "title": notebook.title,
                "tokens_refunded": notebook.tokens_requested,
            })

            logger.info(f"[CLEANUP] Cleaned stale job {job_id} (title: {notebook.title})")

        except Exception as e:
            logger.error(f"[CLEANUP] Failed to clean job {job_id}: {e}")

    session.commit()

    # Publish SSE notification so frontend updates
    try:
        from src.api.utils import publish_notebook_status
        for job in cleaned_jobs:
            publish_notebook_status(user_id, job["job_id"], "failed")
    except Exception as e:
        logger.warning(f"[CLEANUP] Failed to publish SSE notifications: {e}")

    logger.info(f"[CLEANUP] Cleaned {len(cleaned_jobs)} stale jobs for user {user_id}")

    return {"cleaned": len(cleaned_jobs), "jobs": cleaned_jobs}
