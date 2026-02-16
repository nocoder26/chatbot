import os
import json
import logging
from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.responses import FileResponse
from typing import Optional

logger = logging.getLogger("izana.admin")

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")

# --- TRACKING FILES ---
GAP_LOG_FILE = os.getenv("GAP_LOG_FILE", "/tmp/gap_logs.json")
FEEDBACK_LOG_FILE = os.getenv("FEEDBACK_LOG_FILE", "/tmp/feedback_logs.json")
DOC_USAGE_LOG_FILE = os.getenv("DOC_USAGE_LOG_FILE", "/tmp/doc_usage_logs.json")


async def verify_admin(x_admin_key: Optional[str] = Header(None)):
    """Dependency that verifies admin API key from request header."""
    if not ADMIN_API_KEY:
        logger.warning("ADMIN_API_KEY not configured - admin endpoints unprotected")
        return True
    if not x_admin_key or x_admin_key != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing admin key")
    return True


def _read_log_file(filepath: str) -> list:
    """Safely read a JSON log file and return its contents."""
    try:
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                content = f.read()
                if content:
                    return json.loads(content)
    except json.JSONDecodeError as e:
        logger.error(f"Corrupt log file {filepath}: {e}")
    except OSError as e:
        logger.error(f"Error reading log file {filepath}: {e}")
    return []


@router.get("/stats")
async def get_stats(_auth: bool = Depends(verify_admin)):
    """Get admin statistics including gaps, feedback, and document usage logs."""
    gaps = _read_log_file(GAP_LOG_FILE)
    feedback = _read_log_file(FEEDBACK_LOG_FILE)
    doc_usage = _read_log_file(DOC_USAGE_LOG_FILE)

    return {
        "gaps": gaps,
        "feedback": feedback,
        "doc_usage": doc_usage
    }


@router.post("/verify-pin")
async def verify_pin(body: dict):
    """Verify admin PIN from frontend login. PIN is stored server-side only."""
    admin_pin = os.getenv("ADMIN_PIN", "2603")
    if not admin_pin:
        raise HTTPException(status_code=503, detail="Admin PIN not configured on server")

    submitted_pin = body.get("pin", "")
    if submitted_pin == admin_pin:
        return {"authenticated": True, "admin_key": ADMIN_API_KEY}
    raise HTTPException(status_code=401, detail="Incorrect PIN")


@router.get("/download_db")
async def download_database(_auth: bool = Depends(verify_admin)):
    """Download the SQLite database file for local analysis."""
    if os.getenv("RAILWAY_ENVIRONMENT"):
        db_path = "/app/backend/data/chatbot.db"
    else:
        db_path = "./data/chatbot.db"

    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Database file not found")

    return FileResponse(
        path=db_path,
        filename="chatbot.db",
        media_type="application/octet-stream",
    )
