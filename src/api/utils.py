import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
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


def set_job_status(job_id: str, status: str, extra: Optional[dict] = None):
    """
    Updates BOTH Redis (for speed/real-time) and SQL (for persistence).
    Also publishes to SSE clients for real-time updates.
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

    # 3. Pulled SSE publish (now relying on polling)
    pass


def get_job_status(job_id: str):
    job_status = redis_client.hgetall(f"job:{job_id}")
    if not job_status:
        return {}
    
    # Calculate progress percentage
    status = job_status.get(b"status", b"unknown").decode("utf-8")
    progress = 0
    
    if status == "completed":
        progress = 100
    elif status == "failed":
        progress = 0 # Or maintain last progress? Plan said 0 or no change.
    elif status == "queued":
        progress = 0
    elif status == "processing":
        total = int(job_status.get(b"total_chunks", 0))
        completed = int(job_status.get(b"completed_chunks", 0))
        
        if total > 0:
            # TTS Phase: 15% to 90%
            progress = 15 + int((completed / total) * 75)
        else:
            # Pre-TTS Phase: 5% to 15%
            progress = 10
            
    job_status[b"progress_percent"] = str(progress).encode("utf-8")
    return job_status


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

