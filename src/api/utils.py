import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

from dotenv import load_dotenv
from sqlmodel import Field, Session, SQLModel, create_engine, select

from src.api.schema import Notebook

from src.utils.RedisClient import redis_client

# Re-export token utilities to maintain backward compatibility
from src.api.token_utils import (
    calculate_text_tokens,
    check_token_availability,
    deduct_tokens,
    get_user_tokens,
    refund_tokens,
    reset_user_tokens,
)


load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise ValueError("DATABASE_URL environment variable is required")
engine = create_engine(
    database_url, 
    echo=False, 
    pool_pre_ping=True, 
    pool_recycle=1800
)


def sanitize_display_filename(filename: str) -> str:
    """
    Sanitizes a filename for display and database storage, removing potentially harmful characters.
    Keeps alphanumeric, spaces, periods, hyphens, and underscores.
    """
    # Using a regex to allow a broader set of "safe" characters while removing potentially malicious ones.
    # This regex keeps letters, numbers, spaces, periods, hyphens, and underscores.
    # It also removes leading/trailing spaces and multiple consecutive spaces.
    sanitized = re.sub(r"[^\w\s\.\-]", "", filename)
    sanitized = re.sub(r"\s+", " ", sanitized).strip()
    return sanitized


def get_unique_notebook_title(
    user_id: str, desired_title: str, session: Session
) -> str:
    """
    Generates a unique notebook title for a user, appending (N) if necessary.
    """
    base_name, ext = os.path.splitext(desired_title)
    counter = 1
    unique_title = desired_title

    while True:
        statement = select(Notebook).where(
            Notebook.user_id == user_id, Notebook.title == unique_title
        )
        existing_notebook = session.exec(statement).first()

        if not existing_notebook:
            return unique_title

        counter += 1
        unique_title = f"{base_name} ({counter}){ext}"


def set_job_status(job_id: str, status: str, extra: Optional[dict] = None, voice: Optional[str] = None):
    """
    Updates BOTH Redis (for speed/real-time) and SQL (for persistence).
    Also publishes to SSE clients for real-time updates.
    """
    # 1. Update Redis
    data = {"status": status}
    if extra:
        data.update(extra)
    
    # Use voice-specific key if provided
    redis_key = f"job:{job_id}:{voice}" if voice else f"job:{job_id}"
    redis_client.hset(redis_key, mapping=data)
    logger.info(f"DEBUG: Wrote {redis_key} to Redis with status {status}")

    # 2. Sync to SQL (Note: SQL status is usually the 'main' notebook status)
    update_db_status(job_id, status)
    logger.info(f"Job {job_id} SQL status updated to {status}")


def calculate_progress(job_status: dict) -> int:
    """Helper to calculate percentage from Redis job data"""
    status = job_status.get("status", "unknown")
    if status == "completed": return 100
    if status in ["failed", "queued"]: return 0
    
    if status == "processing":
        total = int(job_status.get("total_chunks", 0))
        completed = int(job_status.get("completed_chunks", 0))
        if total > 0:
            return 15 + int((completed / total) * 75)
        return 10
    return 0

def get_job_status(job_id: str, voice: Optional[str] = None):
    # Try voice-specific key first if voice is provided
    redis_key = f"job:{job_id}:{voice}" if voice else f"job:{job_id}"
    job_status = redis_client.hgetall(redis_key)
    
    # Fallback to general key if voice-specific doesn't exist
    if not job_status and voice:
        job_status = redis_client.hgetall(f"job:{job_id}")
        
    if not job_status:
        return {}
    
    progress = calculate_progress(job_status)
    job_status["progress_percent"] = str(progress)
    return job_status

def get_batch_job_statuses(job_voice_pairs: List[tuple]) -> Dict[str, dict]:
    """Scalable approach: Batch fetch multiple job/voice statuses in ONE Redis round-trip"""
    if not job_voice_pairs: return {}
    
    pipe = redis_client.pipeline()
    for jid, voice in job_voice_pairs:
        # Check voice-specific key
        pipe.hgetall(f"job:{jid}:{voice}")
    
    raw_results = pipe.execute()
    
    enriched = {}
    for (jid, voice), job_status in zip(job_voice_pairs, raw_results):
        # Key by jid:voice to prevent collisions
        key = f"{jid}:{voice}"
        
        if not job_status:
            # Fallback to general job key if voice-specific doesn't exist
            job_status = redis_client.hgetall(f"job:{jid}")
            
        if job_status:
            job_status["progress_percent"] = str(calculate_progress(job_status))
            enriched[key] = job_status
        else:
            enriched[key] = {}
    return enriched


def prune_old_uploads(max_age_hours=6):
    """Fail-safe: Delete any temporary files in 'uploads' older than max_age_hours."""
    upload_dir = Path("uploads")
    if not upload_dir.exists():
        return
        
    now = time.time()
    count = 0
    for path in upload_dir.glob("*"):
        if path.is_file():
            file_age = now - path.stat().st_mtime
            if file_age > (max_age_hours * 3600):
                try:
                    path.unlink()
                    count += 1
                except Exception as e:
                    logger.warning(f"Failed to prune {path}: {e}")
    if count > 0:
        logger.info(f"Pruned {count} old files from uploads folder")


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session


def get_user_id_for_job(job_id: str) -> Optional[str]:
    """Get the user_id for a given job_id from the database."""
    try:
        with Session(engine) as session:
            statement = select(Notebook).where(Notebook.job_id == job_id)
            notebook = session.exec(statement).first()
            return notebook.user_id if notebook else None
    except Exception as e:
        logger.error(f"Failed to get user_id for job {job_id}: {e}")
        return None




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
                logger.warning(
                    f"Could not find notebook {job_id} in DB to update status"
                )
    except Exception as e:
        logger.error(f"Failed to sync DB status: {e}")

