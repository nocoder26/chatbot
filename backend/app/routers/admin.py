import os
import json
from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter(prefix="/admin", tags=["admin"])

# --- TRACKING FILES ---
GAP_LOG_FILE = "/tmp/gap_logs.json"
FEEDBACK_LOG_FILE = "/tmp/feedback_logs.json"
DOC_USAGE_LOG_FILE = "/tmp/doc_usage_logs.json" # NEW: For tracking cited documents

@router.get("/stats")
async def get_stats():
    """
    Get admin statistics including gaps, feedback, and document usage logs natively from JSON tracking files.
    """
    gaps, feedback, doc_usage = [], [], []
    
    # 1. Fetch Knowledge Gaps
    try:
        if os.path.exists(GAP_LOG_FILE):
            with open(GAP_LOG_FILE, "r") as f:
                content = f.read()
                if content:
                    gaps = json.loads(content)
    except Exception as e:
        print(f"Error reading gap logs: {e}")
        
    # 2. Fetch User Feedback
    try:
        if os.path.exists(FEEDBACK_LOG_FILE):
            with open(FEEDBACK_LOG_FILE, "r") as f:
                content = f.read()
                if content:
                    feedback = json.loads(content)
    except Exception as e:
        print(f"Error reading feedback logs: {e}")

    # 3. Fetch Document Usage (NEW)
    try:
        if os.path.exists(DOC_USAGE_LOG_FILE):
            with open(DOC_USAGE_LOG_FILE, "r") as f:
                content = f.read()
                if content:
                    doc_usage = json.loads(content)
    except Exception as e:
        print(f"Error reading doc usage logs: {e}")
        
    return {
        "gaps": gaps,
        "feedback": feedback,
        "doc_usage": doc_usage
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
