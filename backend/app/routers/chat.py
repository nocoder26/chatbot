import os
import json
import uuid
import traceback
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from pinecone import Pinecone
from openai import OpenAI
from groq import Groq

router = APIRouter()

# --- CONFIG ---
# We use /tmp because sometimes server permissions block /app/data
GAP_LOG_FILE = "/tmp/gap_logs.json"
FEEDBACK_LOG_FILE = "/tmp/feedback_logs.json"
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
    """Deletes data older than 24 hours for privacy."""
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

def save_log(filepath, entry):
    try:
        logs = []
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                content = f.read()
                if content:
                    logs = json.loads(content)
        logs.append(entry)
        # Keep logs manageable
        if len(logs) > 100: logs = logs[-100:]
        with open(filepath, "w") as f:
            json.dump(logs, f, indent=2)
    except Exception as e:
        print(f"Log Error: {e}")

# --- ENDPOINTS ---

@router.post("/chat")
async def chat_endpoint(request: ChatRequest, background_tasks: BackgroundTasks):
    if not groq_client: raise HTTPException(500, "AI tools not initialized")
    
    # Run privacy cleanup in background
    background_tasks.add_task(cleanup_logs)

    try:
        # 1. Embed Question
        # CHANGED: Switched to 'text-embedding-ada-002' to fix the 0.03 score issue.
        # This aligns with how most data is uploaded.
        emb_resp = openai_client.embeddings.create(
            input=request.message, 
            model="text-embedding-ada-002"
        )
        vector = emb_resp.data[0].embedding

        # 2. Check Semantic Cache
        cache_resp = index.query(namespace=CACHE_NAMESPACE, vector=vector, top_k=1, include_metadata=True)
        if cache_resp.matches and cache_resp.matches[0].score > 0.95:
            return {
                "response": cache_resp.matches[0].metadata["response"],
                "citations": ["Verified Previous Answer"]
            }

        # 3. Search Knowledge Base
        search_resp = index.query(vector=vector, top_k=5, include_metadata=True)
        context_text = ""
        citations = []
        highest_score = 0.0

        for match in search_resp.matches:
            if match.score > highest_score: highest_score = match.score
            # Strict relevance check
            if match.score > 0.75:
                source = match.metadata.get("source", "Medical Database")
                text_chunk = match.metadata.get('text', '')
                context_text += f"Info from {source}: {text_chunk}\n\n"
                if source not in citations: citations.append(source)

        # 4. Gap Detection
        is_gap = False
        if highest_score < 0.75:
            is_gap = True
            entry = {"timestamp": datetime.now().isoformat(), "question": request.message, "score": float(highest_score), "type": "Gap"}
            save_log(GAP_LOG_FILE, entry)
            context_text += "Note: The specific fertility database had limited info, so use general medical knowledge.\n"
            citations.append("General Medical Knowledge")

        # 5. Generate Response (Clean Text)
        system_prompt = f"""
        You are an empathetic fertility assistant. Language: {request.language}.
        
        INSTRUCTIONS:
        1. Answer the user's question using the CONTEXT provided.
        2. TONE: Warm, hopeful, professional caregiver.
        3. FORMAT: Do NOT use inline citations like [Source: X] in the text. The system will display sources separately. Just write a natural response.
        4. ENDING: Always end with a relevant, gentle leading question.

        CONTEXT:
        {context_text}
        """

        completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt}, 
                {"role": "user", "content": request.message}
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.3
        )
        
        return {
            "response": completion.choices[0].message.content,
            "citations": citations,
            "is_gap": is_gap
        }

    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(500, str(e))

@router.post("/feedback")
async def submit_feedback(feedback: FeedbackRequest):
    entry = {
        "timestamp": datetime.now().isoformat(),
        "rating": feedback.rating,
        "question": feedback.question,
        "reason": feedback.reason
    }
    save_log(FEEDBACK_LOG_FILE, entry)

    # Train system: Only save to cache if rating is 5 STARS
    if feedback.rating == 5:
        try:
            emb_resp = openai_client.embeddings.create(input=feedback.question, model="text-embedding-ada-002")
            vector = emb_resp.data[0].embedding
            index.upsert(
                vectors=[{
                    "id": str(uuid.uuid4()),
                    "values": vector,
                    "metadata": {"question": feedback.question, "response": feedback.answer}
                }],
                namespace=CACHE_NAMESPACE
            )
        except Exception as e:
            print(f"Cache Error: {e}")
    
    return {"status": "Recorded"}

@router.get("/admin/stats")
async def get_stats():
    gaps, feedback = [], []
    if os.path.exists(GAP_LOG_FILE):
        with open(GAP_LOG_FILE) as f: 
            try: gaps = json.load(f)
            except: pass
    if os.path.exists(FEEDBACK_LOG_FILE):
        with open(FEEDBACK_LOG_FILE) as f: 
            try: feedback = json.load(f)
            except: pass
    return {"gaps": gaps, "feedback": feedback}
