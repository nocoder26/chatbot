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
import cohere  

router = APIRouter()

# --- CONFIG ---
GAP_LOG_FILE = "/tmp/gap_logs.json"
FEEDBACK_LOG_FILE = "/tmp/feedback_logs.json"
CACHE_NAMESPACE = "semantic-cache"

# --- INITIALIZATION ---
try:
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index = pc.Index(os.getenv("PINECONE_INDEX_NAME"))
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    
    # NEW: Initialize Cohere Reranker (Hardcoded as requested, with env fallback)
    cohere_key = os.getenv("COHERE_API_KEY", "8LT29K24AsAQZbJCYlvz4eHPTtN5duyZkQF1QtXw")
    cohere_client = cohere.Client(cohere_key) if cohere_key else None
    
    print("✅ STARTUP SUCCESS: AI Tools, Cohere & Semantic Cache Ready")
except Exception as e:
    print(f"❌ STARTUP FAILED: {str(e)}")
    pc, index, openai_client, groq_client, cohere_client = None, None, None, None, None

# --- DATA MODELS ---
class ChatRequest(BaseModel):
    message: str
    language: str = "English"

class FeedbackRequest(BaseModel):
    question: str
    answer: str
    rating: int
    reason: str = ""
    suggested_questions: list = [] # NEW: Save generated questions to cache

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
        if len(logs) > 100: logs = logs[-100:]
        with open(filepath, "w") as f:
            json.dump(logs, f, indent=2)
    except Exception as e:
        print(f"Log Error: {e}")

# --- ENDPOINTS ---

@router.post("/chat")
async def chat_endpoint(request: ChatRequest, background_tasks: BackgroundTasks):
    if not groq_client: raise HTTPException(500, "AI tools not initialized")
    
    background_tasks.add_task(cleanup_logs)

    try:
        # --- FEATURE 1: MULTI-QUERY EXPANSION ---
        # Generate 2 alternative ways to ask the question to catch all medical docs
        mq_prompt = f"""
        You are an expert medical search assistant. 
        Generate 2 alternative search queries for the following user question to maximize document retrieval. 
        Language: {request.language}. Question: '{request.message}'
        Return ONLY the 2 queries separated by a newline, with no numbers or intro text.
        """
        mq_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": mq_prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.3
        )
        
        # Combine original + new queries
        expanded_queries = [request.message]
        for q in mq_completion.choices[0].message.content.split('\n'):
            if q.strip(): expanded_queries.append(q.strip())
        expanded_queries = expanded_queries[:3] # Cap at 3 queries

        # Embed all 3 queries at once
        emb_resp = openai_client.embeddings.create(
            input=expanded_queries, 
            model="text-embedding-ada-002"
        )
        vectors = [item.embedding for item in emb_resp.data]

        # --- CHECK SEMANTIC CACHE (Short-Term Memory) ---
        # We only check the original question's vector against the cache
        cache_resp = index.query(namespace=CACHE_NAMESPACE, vector=vectors[0], top_k=1, include_metadata=True)
        if cache_resp.matches and cache_resp.matches[0].score > 0.95:
            cached_meta = cache_resp.matches[0].metadata
            # Extract cached questions if they exist
            try: cached_qs = json.loads(cached_meta.get("suggested_questions", "[]"))
            except: cached_qs = []
            
            return {
                "response": cached_meta["response"],
                "citations": ["Verified Previous Answer"],
                "suggested_questions": cached_qs,
                "is_gap": False
            }

        # --- SEARCH KNOWLEDGE BASE ---
        # Pool results from all 3 queries and remove duplicates
        unique_docs = {}
        for vec in vectors:
            search_resp = index.query(vector=vec, top_k=4, include_metadata=True)
            for match in search_resp.matches:
                unique_docs[match.id] = match
                
        # Extract text and sources
        doc_texts = []
        doc_sources = []
        for match in unique_docs.values():
            txt = match.metadata.get('text', '')
            if txt not in doc_texts:
                doc_texts.append(txt)
                doc_sources.append(match.metadata.get('source', 'Medical Database'))
