from sqlmodel import SQLModel, Field, Session, create_engine, select
from typing import Optional, List
from datetime import datetime

class Notebook(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)  # The Clerk User ID
    job_id: str = Field(unique=True, index=True)
    title: str
    voice: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    status: str = Field(default="processing") 
