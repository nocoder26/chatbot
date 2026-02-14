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
    
    # Initialize Cohere Reranker
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
    suggested_questions: list = []

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
        if len(logs) > 100: 
            logs = logs[-100:]
        with open(filepath, "w") as f:
            json.dump(logs, f, indent=2)
    except Exception as e:
        print(f"Log Error: {e}")

# --- ENDPOINTS ---

@router.post("/chat")
async def chat_endpoint(request: ChatRequest, background_tasks: BackgroundTasks):
    if not groq_client: 
        raise HTTPException(500, "AI tools not initialized")
    
    background_tasks.add_task(cleanup_logs)

    try:
        # --- FEATURE 1: MULTI-QUERY EXPANSION ---
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
        
        expanded_queries = [request.message]
        for q in mq_completion.choices[0].message.content.split('\n'):
            if q.strip(): 
                expanded_queries.append(q.strip())
        expanded_queries = expanded_queries[:3] 

        emb_resp = openai_client.embeddings.create(
            input=expanded_queries, 
            model="text-embedding-ada-002"
        )
        vectors = [item.embedding for item in emb_resp.data]

        # --- CHECK SEMANTIC CACHE (Short-Term Memory) ---
        cache_resp = index.query(namespace=CACHE_NAMESPACE, vector=vectors[0], top_k=1, include_metadata=True)
        if cache_resp.matches and cache_resp.matches[0].score > 0.95:
            cached_meta = cache_resp.matches[0].metadata
            
            # Safely extract cached questions
            try: 
                cached_qs = json.loads(cached_meta.get("suggested_questions", "[]"))
            except Exception: 
                cached_qs = []
            
            return {
                "response": cached_meta["response"],
                "citations": ["Verified Previous Answer"],
                "suggested_questions": cached_qs,
                "is_gap": False
            }

        # --- SEARCH KNOWLEDGE BASE ---
        unique_docs = {}
        for vec in vectors:
            search_resp = index.query(vector=vec, top_k=4, include_metadata=True)
            for match in search_resp.matches:
                unique_docs[match.id] = match
                
        doc_texts = []
        doc_sources = []
        for match in unique_docs.values():
            txt = match.metadata.get('text', '')
            if txt not in doc_texts:
                doc_texts.append(txt)
                doc_sources.append(match.metadata.get('source', 'Medical Database'))

        context_text = ""
        citations = []
        is_gap = False
        highest_score = 0.0

        # --- FEATURE 2: COHERE RERANKER ---
        if cohere_client and doc_texts:
            rerank_resp = cohere_client.rerank(
                model="rerank-multilingual-v3.0",
                query=request.message,
                documents=doc_texts,
                top_n=4
            )
            for r in rerank_resp.results:
                if r.relevance_score > highest_score:
                    highest_score = r.relevance_score
                if r.relevance_score > 0.3:
                    idx = r.index
                    src = doc_sources[idx]
                    context_text += f"Info from {src}: {doc_texts[idx]}\n\n"
                    if src not in citations: 
                        citations.append(src)
            if highest_score < 0.3:
                is_gap = True
        else:
            sorted_matches = sorted(unique_docs.values(), key=lambda x: x.score, reverse=True)
            highest_score = sorted_matches[0].score if sorted_matches else 0.0
            for match in sorted_matches[:4]:
                if match.score > 0.75:
                    src = match.metadata.get("source", "Medical Database")
                    txt = match.metadata.get('text', '')
                    context_text += f"Info from {src}: {txt}\n\n"
                    if src not in citations: 
                        citations.append(src)
            if highest_score < 0.75:
                is_gap = True

        if is_gap:
            entry = {"timestamp": datetime.now().isoformat(), "question": request.message, "score": float(highest_score), "type": "Gap"}
            save_log(GAP_LOG_FILE, entry)
            context_text += "Note: The specific fertility database had limited info, so use general medical knowledge.\n"
            citations.append("General Medical Knowledge")

        # --- GENERATION STEP 1: RAW MEDICAL DRAFT ---
        draft_prompt = f"""
        Answer the following medical question based strictly on the CONTEXT. Language: {request.language}.
        Do not use inline citations. Just provide the facts clearly.
        CONTEXT: {context_text}
        """
        draft_completion = groq_client.chat.completions.create(
            messages=[{"role": "system", "content": draft_prompt}, {"role": "user", "content": request.message}],
            model="llama-3.3-70b-versatile",
            temperature=0.2
        )
        draft_response = draft_completion.choices[0].message.content

        # --- FEATURE 3 & 4: EMPATHETIC REVIEWER & LEADING QUESTIONS ---
        reviewer_prompt = f"""
        You are a highly empathetic fertility caregiver and a supportive friend to couples trying to conceive (TTC).
        Language: {request.language}.

        TASK:
        1. Read the following medical draft response.
        2. Rewrite it to be incredibly easy to understand using simple, calming, and hopeful language.
        3. Explain ALL medical abbreviations.
        4. Maintain a warm caregiver/friend vibe.
        5. Generate EXACTLY 3 clickable leading questions the user might want to ask next to continue the conversation.

        DRAFT RESPONSE:
        {draft_response}

        OUTPUT FORMAT:
        You MUST return ONLY a valid JSON object with this exact schema:
        {{
            "revised_response": "The full, empathetic rewritten response here.",
            "suggested_questions": ["Question 1", "Question 2", "Question 3"]
        }}
        """
        
        reviewer_completion = groq_client.chat.completions.create(
            messages=[{"role": "system", "content": reviewer_prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        try:
            final_data = json.loads(reviewer_completion.choices[0].message.content)
            final_response = final_data.get("revised_response", draft_response)
            suggested_questions = final_data.get("suggested_questions", [])
        except Exception as e:
            print("Failed to parse JSON:", e)
            final_response = draft_response
            suggested_questions = []

        return {
            "response": final_response,
            "citations": citations,
            "is_gap": is_gap,
            "suggested_questions": suggested_questions
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

    if feedback.rating == 5:
        try:
            emb_resp = openai_client.embeddings.create(input=feedback.question, model="text-embedding-ada-002")
            vector = emb_resp.data[0].embedding
            index.upsert(
                vectors=[{
                    "id": str(uuid.uuid4()),
                    "values": vector,
                    "metadata": {
                        "question": feedback.question, 
                        "response": feedback.answer,
                        "suggested_questions": json.dumps(feedback.suggested_questions)
                    }
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
            try: 
                gaps = json.load(f)
            except Exception: 
                pass
    if os.path.exists(FEEDBACK_LOG_FILE):
        with open(FEEDBACK_LOG_FILE) as f: 
            try: 
                feedback = json.load(f)
            except Exception: 
                pass
    return {"gaps": gaps, "feedback": feedback}
