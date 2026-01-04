# src/api/deps.py
import logging
import os
from typing import List

from fastapi import Depends, HTTPException
from fastapi_clerk_auth import ClerkConfig, ClerkHTTPBearer
from sqlmodel import Session, select

from src.TTS_Workers.tasks import get_s3_client
from src.api.utils import get_session
from src.api.schema import Notebook

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

AVAILABLE_VOICES: List[str] = [
    "af_bella",
    "af_sarah",
    "am_michael",
    "bm_fable",
    "bf_emma",
    "em_alex",
]

jwks_url = os.getenv("CLERK_JWKS_URL")
if not jwks_url:
    raise ValueError("CLERK_JWKS_URL environment variable is required")

clerk_config = ClerkConfig(jwks_url=jwks_url)
clerk_auth = ClerkHTTPBearer(config=clerk_config)

s3 = get_s3_client()

LS_SIGNING_SECRET = os.getenv("LS_SIGNING_SECRET")
if not LS_SIGNING_SECRET:
    logger.warning("LS_SIGNING_SECRET environment variable is not set")

LS_API_KEY = os.getenv("LEMON_SQUEEZY_API_KEY")
if not LS_API_KEY:
    logger.warning("LEMON_SQUEEZY_API_KEY environment variable is not set")

LS_API_URL = os.getenv("LEMON_SQUEEZY_API_URL", "https://api.lemonsqueezy.com/v1")
LS_STORE_ID = os.getenv("LEMON_SQUEEZY_STORE_ID")
if not LS_STORE_ID:
    logger.warning("LEMON_SQUEEZY_STORE_ID environment variable is not set")

LS_CREATOR_VARIANT_ID = os.getenv("LEMON_SQUEEZY_CREATOR_VARIANT_ID")
if not LS_CREATOR_VARIANT_ID:
    logger.warning("LEMON_SQUEEZY_CREATOR_VARIANT_ID environment variable is not set")

LS_PROFESSIONAL_VARIANT_ID = os.getenv("LEMON_SQUEEZY_PROFESSIONAL_VARIANT_ID")
if not LS_PROFESSIONAL_VARIANT_ID:
    logger.warning(
        "LEMON_SQUEEZY_PROFESSIONAL_VARIANT_ID environment variable is not set"
    )


async def get_current_user(token_payload=Depends(clerk_auth)) -> str:
    user_id = token_payload.decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user ID")
    return user_id


def check_user_owns_notebook(user_id: str, job_id: str, session: Session) -> Notebook:
    statement = select(Notebook).where(
        Notebook.job_id == job_id, Notebook.user_id == user_id
    )
    notebook = session.exec(statement).first()
    if not notebook:
        raise HTTPException(
            status_code=404, detail="Notebook not found or you don't have permission."
        )
    return notebook
