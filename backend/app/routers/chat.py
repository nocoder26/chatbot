import os
import json
import uuid
import traceback
import re
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from pinecone import Pinecone
from openai import OpenAI
from groq import Groq
import cohere  

router = APIRouter()

# --- CONFIGURATION & LOGGING ---
GAP_LOG_FILE = "/tmp/gap_logs.json"
FEEDBACK_LOG_FILE = "/tmp/feedback_logs.json"
DOC_USAGE_LOG_FILE = "/tmp/doc_usage_logs.json"
CACHE_NAMESPACE = "semantic-cache"

# --- CORE AI INITIALIZATION ---
try:
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index = pc.Index(os.getenv("PINECONE_INDEX_NAME"))
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    cohere_key = os.getenv("COHERE_API_KEY")
    cohere_client = cohere.Client(cohere_key) if cohere_key else None
    print("✅ Chat Router: AI Tools Ready")
except Exception as e:
    print(f"❌ Chat Router: Critical Init Error: {e}")
    pc, index, openai_client, groq_client, cohere_client = None, None, None, None, None

# --- REQUEST MODELS ---
class ChatRequest(BaseModel):
    message: str
    language: str = "English"
    clinical_data: Optional[Dict[str, Any]] = None
    treatment: Optional[str] = None
    interaction_count: int = 0

class FeedbackRequest(BaseModel):
    question: str
    answer: str
    rating: int
    reason: str = ""
    suggested_questions: list = []

# --- UTILITIES ---
def save_log(filepath, entry):
    """Generic JSON logger with rotation for production stability."""
    try:
        logs = []
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                content = f.read()
                if content: logs = json.loads(content)
        logs.append(entry)
        if len(logs) > 500: logs = logs[-500:] 
        with open(filepath, "w") as f: json.dump(logs, f, indent=2)
    except Exception: pass

def clean_citation(raw_source: str) -> str:
    """Formats file paths into clean document titles for citations and admin tracking."""
    try:
        name = raw_source.split('/')[-1].rsplit('.', 1)[0]
        name = re.sub(r'(?i)_compress|-compress|_final_version|_\d_\d|nbsped|factsheet', '', name)
        name = re.sub(r'\d{8,}', '', name) 
        return ' '.join(name.replace('_', ' ').replace('-', ' ').split()).title()
    except: return "Medical Reference"

# --- MAIN CHAT ENDPOINT ---
@router.post("/chat")
async def chat_endpoint(request: ChatRequest, background_tasks: BackgroundTasks):
    if not groq_client: raise HTTPException(500, "AI tools not initialized")

    try:
        is_blood_work = request.clinical_data is not None
        lab_summary = ""
        missing_params_text = ""
        
        # 1. CONTEXT RETRIEVAL
        if is_blood_work:
            lab_results = request.clinical_data.get("results", [])
            lab_summary = ", ".join([f"{r.get('name')}: {r.get('value')} {r.get('unit')}" for r in lab_results])
            search_query = f"Clinical implications of fertility labs: {lab_summary} for {request.treatment or 'fertility'}."
            
            # Internal check for missing markers
            check_prompt = f"Check labs: {lab_summary}. Identify missing: FSH, AMH, LH, Estradiol, TSH, Prolactin. Return list or 'COMPLETE'."
            try:
                check_comp = groq_client.chat.completions.create(messages=[{"role": "user", "content": check_prompt}], model="llama-3.1-8b-instant", temperature=0.1)
                missing = check_comp.choices[0].message.content.strip()
                if "COMPLETE" not in missing.upper():
                    missing_params_text = f"\n\nNote for analysis: Gently inform the user that {missing} are missing but crucial for a full evaluation."
            except Exception: pass
        else:
            search_query = request.message

        # Semantic Search in Pinecone
        emb_resp = openai_client.embeddings.create(input=[search_query], model="text-embedding-ada-002")
        vector = emb_resp.data[0].embedding
        search_resp = index.query(vector=vector, top_k=5, include_metadata=True)
        
        context_text, citations, highest_score = "", [], 0.0
        for match in search_resp.matches:
            if match.score > highest_score: highest_score = match.score
            src = clean_citation(match.metadata.get('source', 'Medical Database'))
            context_text += f"Info from {src}: {match.metadata.get('text', '')}\n\n"
            if src not in citations: 
                citations.append(src)
                # Log usage for Admin Dashboard at 0.25 threshold
                background_tasks.add_task(save_log, DOC_USAGE_LOG_FILE, {"timestamp": datetime.now().isoformat(), "document": src})

        if highest_score < 0.3:
            background_tasks.add_task(save_log, GAP_LOG_FILE, {"timestamp": datetime.now().isoformat(), "question": search_query, "score": float(highest_score), "type": "Gap"})

        # 2. DRAFTING RESPONSE (Maintaining medical depth while tapering promo)
        promo = "Briefly suggest checking Izana's personalized nutrition and lifestyle plans." if request.interaction_count == 0 else "Do NOT mention Izana plans."
        
        system_prompt = f"""You are Izana AI, a medical information assistant.
        {promo} Always provide detailed medical context. Speak in the third-person plural.
        CONTEXT: {context_text} {missing_params_text}"""

        draft_comp = groq_client.chat.completions.create(
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": search_query}],
            model="llama-3.3-70b-versatile",
            temperature=0.3
        )
        draft_response = draft_comp.choices[0].message.content

        # 3. CRITICAL JSON RECOVERY LOOP (Fixes "No response received")
        try:
            qc_prompt = f"""
            Return ONLY a valid JSON object. 
            Structure: {{"revised_response": "string", "suggested_questions": ["q1", "q2", "q3"]}}
            Language: {request.language}
            Content: {draft_response}
            """
            qc_comp = groq_client.chat.completions.create(
                messages=[{"role": "system", "content": qc_prompt}],
                model="llama-3.1-8b-instant",
                response_format={"type": "json_object"},
                timeout=7.0
            )
            final_data = json.loads(qc_comp.choices[0].message.content)
            res_text = final_data.get("revised_response")
            res_qs = final_data.get("suggested_questions")
            
            if not res_text or len(str(res_text)) < 10:
                raise ValueError("Incomplete Model Output")

        except Exception as e:
            # HARD RECOVERY: Ensures frontend always gets data
            print(f"JSON Recovery Loop Triggered: {e}")
            res_text = draft_response
            res_qs = [
                "What are the next steps for my treatment?",
                "How does diet impact these results?",
                "Tell me more about AMH levels."
            ]

        return {
            "response": str(res_text).replace("**", "").replace("*", "").strip(),
            "citations": citations,
            "suggested_questions": res_qs[:3]
        }

    except Exception as e:
        print(traceback.format_exc())
        return {
            "response": "I encountered a processing error. Could you please try asking your question again?",
            "citations": [],
            "suggested_questions": ["Try again", "What is IVF?", "How to improve fertility?"]
        }

@router.post("/feedback")
async def submit_feedback(feedback: FeedbackRequest, background_tasks: BackgroundTasks):
    entry = {"timestamp": datetime.now().isoformat(), "rating": feedback.rating, "question": feedback.question, "reason": feedback.reason}
    background_tasks.add_task(save_log, FEEDBACK_LOG_FILE, entry)
    if feedback.rating == 5:
        try:
            emb_resp = openai_client.embeddings.create(input=feedback.question, model="text-embedding-ada-002")
            index.upsert(vectors=[{"id": str(uuid.uuid4()), "values": emb_resp.data[0].embedding, "metadata": {"question": feedback.question, "response": feedback.answer, "suggested_questions": json.dumps(feedback.suggested_questions)}}], namespace=CACHE_NAMESPACE)
        except Exception: pass
    return {"status": "Recorded"}

@router.get("/admin/stats")
async def get_stats():
    """Aggregates all tracker files for the Master Dashboard."""
    gaps, feedback, usage = [], [], []
    for log_file, target_list in [(GAP_LOG_FILE, gaps), (FEEDBACK_LOG_FILE, feedback), (DOC_USAGE_LOG_FILE, usage)]:
        if os.path.exists(log_file):
            with open(log_file) as f: 
                try: target_list.extend(json.load(f))
                except: pass
    return {"gaps": gaps, "feedback": feedback, "doc_usage": usage}
