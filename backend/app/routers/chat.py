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
        # Use /tmp if /app/data fails (fallback for restricted environments)
        directory = os.path.dirname(filepath)
        if not os.path.exists(directory):
            try:
                os.makedirs(directory, exist_ok=True)
            except:
                filepath = "/tmp/" + os.path.basename(filepath)
        
        logs = []
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                content = f.read()
                if content:
                    logs = json.loads(content)
        logs.append(entry)
        
        # Limit log size
        if len(logs) > 200: logs = logs[-200:]
            
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
        # 1. Embed Question
        # SWITCHED to 'text-embedding-ada-002' to fix the 0.03 score issue.
        emb_resp = openai_client.embeddings.create(
            input=request.message, 
            model="text-embedding-ada-002"
        )
        vector = emb_resp.data[0].embedding

        # 2. Check Cache
        cache_resp = index.query(namespace=CACHE_NAMESPACE, vector=vector, top_k=1, include_metadata=True)
        if cache_resp.matches and cache_resp.matches[0].score > 0.95:
            return {
                "response": cache_resp.matches[0].metadata["response"],
                "citations": ["Trusted Previous Answer"]
            }

        # 3. Search Knowledge Base
        search_resp = index.query(vector=vector, top_k=5, include_metadata=True)
        context_text = ""
        citations = []
        highest_score = 0.0

        for match in search_resp.matches:
            if match.score > highest_score: highest_score = match.score
            # Threshold set to 0.75 for high relevance
            if match.score > 0.75:
                source = match.metadata.get("source", "Medical Database")
                text_chunk = match.metadata.get('text', '')
                context_text += f"Info from {source}: {text_chunk}\n\n"
                if source not in citations: citations.append(source)

        # 4. Gap Detection
        is_gap = False
        if highest_score < 0.75:
            is_gap = True
            log_gap(request.message, highest_score)
            context_text += "Note: The specific fertility database had limited info, so use general medical knowledge.\n"
            citations.append("General Medical Knowledge")

        # 5. Generate Response (Clean Text)
        system_prompt = f"""
        You are an empathetic fertility assistant. Language: {request.language}.
        
        INSTRUCTIONS:
        1. Answer the user's question using the CONTEXT provided.
        2. TONE: Warm, hopeful, professional caregiver.
        3. FORMAT: Do NOT use inline citations like [Source: X] in the text sentences. The system will display sources separately at the bottom.
        4. GAP: If the context is empty, use general medical knowledge but be transparent about it.
        5. ENDING: Always end with a relevant, gentle leading question.

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

    # Train system on 5-star ratings
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
    # Attempt to read from primary location, fallback to /tmp
    for loc in [GAP_LOG_FILE, "/tmp/gap_logs.json"]:
        if os.path.exists(loc):
            with open(loc) as f: 
                try: gaps = json.load(f)
                except: pass
            break
            
    for loc in [FEEDBACK_LOG_FILE, "/tmp/feedback_logs.json"]:
        if os.path.exists(loc):
            with open(loc) as f: 
                try: feedback = json.load(f)
                except: pass
            break
            
    return {"gaps": gaps, "feedback": feedback}
