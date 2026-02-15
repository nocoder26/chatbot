import os
import json
from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter(prefix="/admin", tags=["admin"])

GAP_LOG_FILE = "/tmp/gap_logs.json"
FEEDBACK_LOG_FILE = "/tmp/feedback_logs.json"

@router.get("/stats")
async def get_stats():
    """
    Get admin statistics including gaps and feedback logs natively from the JSON tracking files.
    """
    gaps, feedback = [], []
    
    # Fetch Knowledge Gaps
    try:
        if os.path.exists(GAP_LOG_FILE):
            with open(GAP_LOG_FILE, "r") as f:
                content = f.read()
                if content:
                    gaps = json.loads(content)
    except Exception as e:
        print(f"Error reading gap logs: {e}")
        
    # Fetch User Feedback
    try:
        if os.path.exists(FEEDBACK_LOG_FILE):
            with open(FEEDBACK_LOG_FILE, "r") as f:
                content = f.read()
                if content:
                    feedback = json.loads(content)
    except Exception as e:
        print(f"Error reading feedback logs: {e}")
        
    return {
        "gaps": gaps,
        "feedback": feedback
    }

@router.get("/download_db")
async def download_database():
    """
    Download the legacy SQLite database file for local analysis (kept for backward compatibility).
    """
    if os.getenv("RAILWAY_ENVIRONMENT"):
        db_path = "/app/backend/data/chatbot.db"
    else:
        db_path = "./backend/data/chatbot.db"

    if not os.path.exists(db_path):
        db_path = "./data/chatbot.db"

    if os.path.exists(db_path):
        return FileResponse(
            path=db_path,
            filename="chatbot.db",
            media_type="application/octet-stream",
        )
    return {"error": "Database file not found."}
