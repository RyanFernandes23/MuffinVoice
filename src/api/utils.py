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
from src.Chunker.chunker import segment_text
from src.TextCleaner.cleaner import cleaner_stage_2
from src.TextCleaner.cleaner_stage1 import TTSTextCleaner
from src.TextExtractor.text_extractor import TextExtractor
from src.TTS_Workers.tasks import get_s3_client, process_speeches
from src.utils.RedisClient import redis_client



load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise ValueError("DATABASE_URL environment variable is required")
engine = create_engine(database_url, echo=False)


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
    if not job_status:
        return {}
    return job_status


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


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
                logger.warning(
                    f"Could not find notebook {job_id} in DB to update status"
                )
    except Exception as e:
        logger.error(f"Failed to sync DB status: {e}")




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

        s3 = get_s3_client()
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
