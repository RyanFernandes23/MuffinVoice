# filepath: c:\Users\Hp\OneDrive\Desktop\WikiVoice\src\api\main.py
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routers.notebooks import notebooks_router
from src.api.routers.notes import notes_router
from src.api.routers.payment import router as payment_router
from src.api.utils import create_db_and_tables

load_dotenv()

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
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


