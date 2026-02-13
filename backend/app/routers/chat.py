import os
import json
import uuid
import time
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from pinecone import Pinecone
from openai import OpenAI
from groq import Groq

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
                # Keep only recent logs
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
    
    # Schedule privacy cleanup
    background_tasks.add_task(cleanup_logs)

    try:
        # 1. Embed Question
        emb_resp = openai_client.embeddings.create(input=request.message, model="text-embedding-3-small")
        vector = emb_resp.data[0].embedding

        # 2. Check Cache First (High Efficiency)
        cache_resp = index.query(namespace=CACHE_NAMESPACE, vector=vector, top_k=1, include_metadata=True)
        if cache_resp.matches and cache_resp.matches[0].score > 0.95:
            return {
                "response": cache_resp.matches[0].metadata["response"],
                "is_cached": True,
                "citations": ["Trusted Previous Answer"]
            }

        # 3. Search Knowledge Base
        search_resp = index.query(vector=vector, top_k=4, include_metadata=True)
        context_text = ""
        citations = []
        highest_score = 0.0

        for match in search_resp.matches:
            if match.score > highest_score: highest_score = match.score
            if match.score > 0.75:
                source = match.metadata.get("source", "Medical Database")
                context_text += f"[Source: {source}]: {match.metadata.get('text', '')}\n\n"
                if source not in citations: citations.append(source)

        # 4. Gap Detection
        if highest_score < 0.75:
            log_gap(request.message, highest_score)
            context_text += "[Source: General Medical Knowledge]: (Using general medical knowledge to supplement.)\n"
            citations.append("General Medical Knowledge")

        # 5. Generate Response
        system_prompt = f"""
        You are an empathetic fertility assistant. Language: {request.language}.
        
        RULES:
        1. Use the CONTEXT. If empty, use general knowledge but cite it as 'General Medical Knowledge'.
        2. TONE: Warm, hopeful, caregiver style.
        3. ENDING: Always end with a short, gentle leading question.
        4. CITATIONS: Use [Source: Name] inline.
        
        CONTEXT:
        {context_text}
        """

        completion = groq_client.chat.completions.create(
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": request.message}],
            model="llama-3.3-70b-versatile",
            temperature=0.3
        )
        
        return {
            "response": completion.choices[0].message.content,
            "citations": citations
        }

    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(500, str(e))

@router.post("/feedback")
async def submit_feedback(feedback: FeedbackRequest):
    # 1. Log the feedback for Admin Dashboard
    entry = {
        "timestamp": datetime.now().isoformat(),
        "rating": feedback.rating,
        "question": feedback.question,
        "reason": feedback.reason
    }
    save_log(FEEDBACK_LOG_FILE, entry)

    # 2. "Train" the system (Cache 5-star answers)
    if feedback.rating == 5:
        try:
            emb_resp = openai_client.embeddings.create(input=feedback.question, model="text-embedding-3-small")
            vector = emb_resp.data[0].embedding
            index.upsert(
                vectors=[{
                    "id": str(uuid.uuid4()),
                    "values": vector,
                    "metadata": {"question": feedback.question, "response": feedback.answer}
                }],
                namespace=CACHE_NAMESPACE
            )
            return {"status": "System learned from this feedback"}
        except Exception as e:
            print(f"Cache Error: {e}")
    
    return {"status": "Feedback recorded"}

@router.get("/admin/stats")
async def get_stats():
    gaps, feedback = [], []
    if os.path.exists(GAP_LOG_FILE):
        with open(GAP_LOG_FILE) as f: gaps = json.load(f)
    if os.path.exists(FEEDBACK_LOG_FILE):
        with open(FEEDBACK_LOG_FILE) as f: feedback = json.load(f)
    return {"gaps": gaps, "feedback": feedback}
