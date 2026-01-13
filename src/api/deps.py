# src/api/deps.py
import logging
import os
from typing import List

import razorpay
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

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
if not RAZORPAY_KEY_ID:
    logger.warning("RAZORPAY_KEY_ID environment variable is not set")

RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
if not RAZORPAY_KEY_SECRET:
    logger.warning("RAZORPAY_KEY_SECRET environment variable is not set")

RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET")
if not RAZORPAY_WEBHOOK_SECRET:
    logger.warning("RAZORPAY_WEBHOOK_SECRET environment variable is not set")

RAZORPAY_CREATOR_PLAN_ID = os.getenv("RAZORPAY_CREATOR_PLAN_ID")
if not RAZORPAY_CREATOR_PLAN_ID:
    logger.warning("RAZORPAY_CREATOR_PLAN_ID environment variable is not set")

RAZORPAY_PROFESSIONAL_PLAN_ID = os.getenv("RAZORPAY_PROFESSIONAL_PLAN_ID")
if not RAZORPAY_PROFESSIONAL_PLAN_ID:
    logger.warning("RAZORPAY_PROFESSIONAL_PLAN_ID environment variable is not set")

RAZORPAY_CREATOR_SUB_ID = os.getenv("RAZORPAY_CREATOR_SUB_ID")
if not RAZORPAY_CREATOR_SUB_ID:
    logger.warning("RAZORPAY_CREATOR_SUB_ID environment variable is not set")

RAZORPAY_PROFESSIONAL_SUB_ID = os.getenv("RAZORPAY_PROFESSIONAL_SUB_ID")
if not RAZORPAY_PROFESSIONAL_SUB_ID:
    logger.warning("RAZORPAY_PROFESSIONAL_SUB_ID environment variable is not set")

razorpay_client = None
if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
    razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    logger.info("Razorpay client initialized successfully")
else:
    logger.warning("Razorpay client not initialized - missing credentials")


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
