import logging
import os
from typing import List

from fastapi import Depends, HTTPException
from fastapi_clerk_auth import ClerkConfig, ClerkHTTPBearer
from sqlmodel import Session, select

from src.api.schema import Notebook
from src.api.utils import get_session

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
