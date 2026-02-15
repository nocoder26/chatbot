import os
import json
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ChatLog, Feedback

router = APIRouter(prefix="/admin", tags=["admin"])

GAP_LOG_FILE = "/tmp/gap_logs.json"

class GapItem(BaseModel):
    id: int
    query: str
    response: str
    lang: str
    score: Optional[float]
    created_at: datetime

    class Config:
        from_attributes = True

class FeedbackItem(BaseModel):
    id: int
    chat_id: int
    query: str
    response: str
    rating: int
    comment: Optional[str]
    created_at: datetime

class AdminStats(BaseModel):
    gaps: List[GapItem]
    low_ratings: List[FeedbackItem]

@router.get("/stats", response_model=AdminStats)
async def get_stats(db: Session = Depends(get_db)):
    """
    Get admin statistics including gaps and low ratings from SQLite.
    """
    gaps = (
        db.query(ChatLog)
        .filter(ChatLog.is_gap == True)
        .order_by(ChatLog.created_at.desc())
        .limit(50)
        .all()
    )

    low_ratings_query = (
        db.query(Feedback, ChatLog)
        .join(ChatLog, Feedback.chat_id == ChatLog.id)
        .filter(Feedback.rating < 3)
        .order_by(Feedback.created_at.desc())
        .limit(50)
        .all()
    )

    low_ratings = [
        FeedbackItem(
            id=feedback.id,
            chat_id=feedback.chat_id,
            query=chat.query,
            response=chat.response,
            rating=feedback.rating,
            comment=feedback.comment,
            created_at=feedback.created_at,
        )
        for feedback, chat in low_ratings_query
    ]

    return AdminStats(
        gaps=[GapItem.model_validate(g) for g in gaps],
        low_ratings=low_ratings,
    )

@router.get("/download_db")
async def download_database():
    """
    Download the SQLite database file for local analysis.
    """
    if os.getenv("RAILWAY_ENVIRONMENT"):
        db_path = "/app/backend/data/chatbot.db"
    else:
        db_path = "./backend/data/chatbot.db"

    if not os.path.exists(db_path):
        db_path = "./data/chatbot.db"

    return FileResponse(
        path=db_path,
        filename="chatbot.db",
        media_type="application/octet-stream",
    )

@router.get("/gaps")
async def get_knowledge_gaps():
    """Fetches the logged gaps where the knowledge base lacked sufficient data."""
    gaps = []
    try:
        if os.path.exists(GAP_LOG_FILE):
            with open(GAP_LOG_FILE, "r") as f:
                content = f.read()
                if content:
                    gaps = json.loads(content)
    except Exception as e:
        print(f"Error reading gap logs: {e}")
        
    return {"gaps": gaps}
