from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Feedback, ChatLog

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackRequest(BaseModel):
    chat_id: int
    rating: int
    comment: Optional[str] = None


class FeedbackResponse(BaseModel):
    id: int
    chat_id: int
    rating: int
    comment: Optional[str]


@router.post("", response_model=FeedbackResponse)
async def submit_feedback(request: FeedbackRequest, db: Session = Depends(get_db)):
    """
    Submit feedback for a chat response.

    Args:
        chat_id: The ID of the chat log to provide feedback for.
        rating: Rating from 1-5 stars.
        comment: Optional comment explaining the rating.
    """
    # Validate rating
    if not 1 <= request.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    # Verify chat exists
    chat_log = db.query(ChatLog).filter(ChatLog.id == request.chat_id).first()
    if not chat_log:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Check if feedback already exists
    existing = db.query(Feedback).filter(Feedback.chat_id == request.chat_id).first()
    if existing:
        # Update existing feedback
        existing.rating = request.rating
        existing.comment = request.comment
        db.commit()
        db.refresh(existing)
        return FeedbackResponse(
            id=existing.id,
            chat_id=existing.chat_id,
            rating=existing.rating,
            comment=existing.comment,
        )

    # Create new feedback
    feedback = Feedback(
        chat_id=request.chat_id,
        rating=request.rating,
        comment=request.comment,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    return FeedbackResponse(
        id=feedback.id,
        chat_id=feedback.chat_id,
        rating=feedback.rating,
        comment=feedback.comment,
    )
