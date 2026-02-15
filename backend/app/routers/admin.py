import os
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ChatLog, Feedback

router = APIRouter(prefix="/admin", tags=["admin"])


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
    Get admin statistics including gaps and low ratings.

    Returns:
        - gaps: Last 50 chat logs where is_gap=True (low confidence matches)
        - low_ratings: Last 50 feedback entries with rating < 3
    """
    # Get last 50 gaps
    gaps = (
        db.query(ChatLog)
        .filter(ChatLog.is_gap == True)
        .order_by(ChatLog.created_at.desc())
        .limit(50)
        .all()
    )

    # Get last 50 low ratings (rating < 3) with chat details
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

    Returns:
        The chatbot.db file as a downloadable attachment.
    """
    # Determine database path based on environment
    if os.getenv("RAILWAY_ENVIRONMENT"):
        db_path = "/app/backend/data/chatbot.db"
    else:
        db_path = "./backend/data/chatbot.db"

    if not os.path.exists(db_path):
        # Try alternate path when running from backend directory
        db_path = "./data/chatbot.db"

    return FileResponse(
        path=db_path,
        filename="chatbot.db",
        media_type="application/octet-stream",
    )
    import os
from pinecone import Pinecone

# Initialize a local Pinecone client specifically for the admin router
# (Using os.getenv ensures we grab the keys from Railway/Vercel)
pc_admin = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

@router.get("/pending-clinical")
async def get_pending_clinical():
    """Fetches the 20 synthetic/unverified cases from Pinecone staging."""
    try:
        # Connect to your 1536-dim index
        idx = pc_admin.Index("reproductive-health")
        
        # Query with a zero-vector to list the namespace contents
        results = idx.query(
            vector=[0.0] * 1536, 
            top_k=20, 
            include_metadata=True, 
            namespace="clinical-cases-staging"
        )
        
        return {
            "cases": [
                {
                    "id": m.id,
                    "text": m.metadata.get("text", "No clinical summary available"),
                    "scenario": m.metadata.get("scenario", "System Generated"),
                    "score": m.score
                } for m in results.matches
            ]
        }
    except Exception as e:
        return {"cases": [], "error": str(e)}
