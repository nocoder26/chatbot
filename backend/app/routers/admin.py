import os
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from pinecone import Pinecone

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
        db.query
