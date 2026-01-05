import logging
import os
import re
import json
from uuid import uuid4
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field, Session, create_engine, select
from src.TTS_Workers.tasks import process_speeches, get_s3_client
from src.TextExtractor.text_extractor import TextExtractor
from src.Chunker.chunker import segment_text
from src.TextCleaner.cleaner import cleaner_stage_2
from src.TextCleaner.cleaner_stage1 import TTSTextCleaner
from src.utils.RedisClient import redis_client
from src.api.schema import Notebook, UserSubscription
from dotenv import load_dotenv

# Subscription Character Limits
CREATOR_VARIANT_ID = os.getenv("LEMON_SQUEEZY_CREATOR_VARIANT_ID", "")
PROFESSIONAL_VARIANT_ID = os.getenv("LEMON_SQUEEZY_PROFESSIONAL_VARIANT_ID", "")
EXPLORER_VARIANT_ID = ""  # Empty string for free users

SUBSCRIPTION_LIMITS = {
    CREATOR_VARIANT_ID: 250000,
    PROFESSIONAL_VARIANT_ID: 1000000,
    EXPLORER_VARIANT_ID: 15000,
}
DEFAULT_LIMIT = 15000  # Free/Explorer plan limit

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


def increment_user_usage(user_id: str, char_length: int):
    """Increments the monthly character usage for a user if a subscription exists."""
    try:
        with Session(engine) as session:
            sub = session.get(UserSubscription, user_id)
            if sub:
                sub.monthly_char_used += char_length
                sub.updated_at = datetime.now(timezone.utc)
                session.add(sub)
                session.commit()
                # Fetch limit for logging
                limit = SUBSCRIPTION_LIMITS.get(sub.variant_id, DEFAULT_LIMIT)
                logger.info(
                    f"User {user_id} usage successfully incremented. New total used: {sub.monthly_char_used}/{limit}"
                )
            else:
                logger.warning(
                    f"Could not find subscription for user {user_id} to increment usage."
                )
    except Exception as e:
        logger.error(f"Failed to increment user usage for {user_id}: {e}")


def get_or_create_explorer_subscription(user_id: str) -> UserSubscription:
    """
    Gets existing subscription or creates an Explorer (free) subscription for the user.
    Called on first file processing to ensure free users have usage tracking.
    """
    try:
        with Session(engine) as session:
            sub = session.get(UserSubscription, user_id)

            if sub:
                return sub

            new_sub = UserSubscription(
                user_id=user_id,
                customer_id=f"explorer_{user_id}",
                subscription_id=f"explorer_{user_id}",
                variant_id=EXPLORER_VARIANT_ID,
                status="active",
                current_period_end=None,
                monthly_char_used=0,
                last_usage_reset_at=datetime.now(timezone.utc),
            )
            session.add(new_sub)
            session.commit()
            logger.info(f"Created Explorer subscription for free user {user_id}")
            return new_sub

    except Exception as e:
        logger.error(f"Failed to create Explorer subscription for user {user_id}: {e}")
        raise


def process_file_task(user_id, job_id, file_path, voice):
    # Update status to processing in Redis AND DB
    set_job_status(job_id, "processing")

    c1_chunks = []
    c2_chunks = []
    try:
        logging.info(
            f"Starting process_file_task for job {job_id} with file {file_path}"
        )
        cleaner1 = TTSTextCleaner()

        extractor = TextExtractor(file_path)
        full_text = extractor.extract_file()

        # --- START: Character Limit Check & Enforcement ---
        file_char_length = len(full_text)

        with Session(engine) as session:
            sub = session.get(UserSubscription, user_id)

            if not sub:
                logger.info(
                    f"No subscription found for user {user_id}. Creating Explorer subscription."
                )
                sub = get_or_create_explorer_subscription(user_id)
                sub = session.get(UserSubscription, user_id)

            limit = SUBSCRIPTION_LIMITS.get(sub.variant_id, DEFAULT_LIMIT)
            monthly_char_used = sub.monthly_char_used

            if sub.variant_id != EXPLORER_VARIANT_ID:
                now = datetime.now(timezone.utc)
                if (
                    sub.current_period_end
                    and now > sub.current_period_end
                    and sub.last_usage_reset_at < sub.current_period_end
                ):
                    sub.monthly_char_used = 0
                    sub.last_usage_reset_at = sub.current_period_end
                    session.add(sub)
                    session.commit()
                    logger.info(
                        f"User {user_id} character limit reset due to expired billing cycle (defensive check)."
                    )

            # Character Limit Check
            if monthly_char_used + file_char_length > limit:
                # Remove the file that was just uploaded
                if os.path.exists(file_path):
                    os.remove(file_path)

                remaining = max(0, limit - monthly_char_used)
                set_job_status(
                    job_id,
                    "failed",
                    {
                        "error": f"File too long. Length is {file_char_length} chars. Remaining monthly limit is {remaining} chars."
                    },
                )
                raise PermissionError(
                    f"Character limit exceeded. File length: {file_char_length}. Remaining limit: {remaining}."
                )

        # --- END: Character Limit Check & Enforcement ---

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
        s3.put_object(
            Bucket="ttsfiles",
            Key=f"{s3_prefix}/chunks_c1.json",
            Body=json.dumps(c1_chunks).encode("utf-8"),
            ContentType="application/json",
        )

        s3.put_object(
            Bucket="ttsfiles",
            Key=f"{s3_prefix}/chunks.json",
            Body=json.dumps(c2_chunks).encode("utf-8"),
            ContentType="application/json",
        )

        s3.put_object(
            Bucket="ttsfiles",
            Key=f"{s3_prefix}/full_text.txt",
            Body=full_text.encode("utf-8"),
            ContentType="text/plain",
        )

        os.remove(file_path)
        logging.info(f"[TASK] Completed text extraction for {file_path}")

        # Increment user usage as S3 upload succeeded
        increment_user_usage(user_id, file_char_length)

        # Trigger Dramatiq worker
        process_speeches.send(user_id, job_id, voice)

        logger.info(f"Queued process_speeches for job {job_id}")

    except Exception as e:
        set_job_status(job_id, "failed", {"error": str(e)})
        logging.error(f"process_file_task failed for job {job_id}: {e}", exc_info=True)
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
