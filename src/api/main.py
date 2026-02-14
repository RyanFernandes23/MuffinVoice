# filepath: c:\Users\Hp\OneDrive\Desktop\WikiVoice\src\api\main.py
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routers.notebooks import notebooks_router
from src.api.routers.notes import notes_router
from src.api.routers.payment import router as payment_router
from src.api.routers.usage import router as usage_router
from src.api.routers.webhooks import webhooks_router  # Add this line
from src.api.utils import create_db_and_tables
from src.api.jobs import schedule_monthly_reset, schedule_daily_checks

load_dotenv()

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()

    # Schedule background jobs
    try:
        schedule_monthly_reset()
        schedule_daily_checks()
        logger.info("[STARTUP] Background jobs scheduled successfully")
    except Exception as e:
        logger.error(f"[STARTUP] Failed to schedule background jobs: {e}")

    yield


app = FastAPI(title="TTS API with Dramatiq", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(notebooks_router)
app.include_router(notes_router)
app.include_router(payment_router)
app.include_router(usage_router)
app.include_router(webhooks_router)
