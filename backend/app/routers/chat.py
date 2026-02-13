import os
import json
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from pinecone import Pinecone
from openai import OpenAI
from groq import Groq
import traceback

router = APIRouter()

# --- CONFIG ---
GAP_LOG_FILE = "/app/data/gap_logs.json"
FEEDBACK_LOG_FILE = "/app/data/feedback_logs.json"
CACHE_NAMESPACE = "semantic-cache"

# --- INITIALIZATION ---
try:
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index = pc.Index(os.getenv("PINECONE_INDEX_NAME"))
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    print("✅ STARTUP SUCCESS: AI Tools & Semantic Cache Ready")
except Exception as e:
    print(f"❌ STARTUP FAILED: {str(e)}")
    pc, index, openai_client, groq_client = None, None, None, None

# --- DATA MODELS ---
class ChatRequest(BaseModel):
    message: str
    language: str = "English"

class FeedbackRequest(BaseModel):
    question: str
    answer: str
    rating: int
    reason: str = ""

# --- HELPER FUNCTIONS ---
def cleanup_logs():
    """Deletes logs older than 24 hours for privacy."""
    try:
        cutoff = datetime.now() - timedelta(hours=24)
        for filepath in [GAP_LOG_FILE, FEEDBACK_LOG_FILE]:
            if os.path.exists(filepath):
                with open(filepath, "r") as f:
                    logs = json.load(f)
                new_logs = [log for log in logs if datetime.fromisoformat(log["timestamp"]) > cutoff]
                with open(filepath, "w") as f:
                    json.dump(new_logs, f, indent=2)
    except Exception as e:
        print(f"Cleanup Error: {e}")

def log_gap(question, score):
    entry = {"timestamp": datetime.now().isoformat(), "question": question, "score": float(score), "type": "Gap"}
    save_log(GAP_LOG_FILE, entry)

def save_log(filepath, entry):
    try:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        logs = []
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                logs = json.loads(f.read() or "[]")
        logs.append(entry)
        with open(filepath, "w") as f:
            json.dump(logs, f, indent=2)
    except Exception as e:
        print(f"Log Error: {e}")

# --- ENDPOINTS ---

@router.post("/chat")
async def chat_endpoint(request: ChatRequest, background_tasks: BackgroundTasks):
    if not groq_client: raise HTTPException(500, "AI not ready")
    
    background_tasks.add_task(cleanup_logs)

    try:
        # 1. Embed Question (Using ada-002 for high compatibility)
        emb_resp = openai_client.embeddings.create(
            input=request.message, 
            model="text-embedding-ada-002"
        )
        vector = emb_resp.data[0].embedding

        # 2. Check Cache
        cache_resp = index.query(namespace=CACHE_NAMESPACE, vector=vector, top_k=1, include_metadata=True)
        if cache_resp.matches and cache
