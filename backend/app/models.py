from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class ChatLog(Base):
    """Model for storing chat interactions."""

    __tablename__ = "chat_logs"

    id = Column(Integer, primary_key=True, index=True)
    query = Column(Text, nullable=False)
    response = Column(Text, nullable=False)
    lang = Column(String(10), default="en")
    is_gap = Column(Boolean, default=False)
    score = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship to feedback
    feedback = relationship("Feedback", back_populates="chat_log", uselist=False)


class Feedback(Base):
    """Model for storing user feedback on chat responses."""

    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chat_logs.id"), nullable=False)
    rating = Column(Integer, nullable=False)  # e.g., 1-5 stars
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship to chat log
    chat_log = relationship("ChatLog", back_populates="feedback")
