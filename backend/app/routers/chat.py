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

# --- LOG PATHS ---
GAP_LOG_FILE = "/tmp/gap_logs.json"
FEEDBACK_LOG_FILE = "/tmp/feedback_logs.json"
DOC_USAGE_LOG_FILE = "/tmp/doc_usage_logs.json"
CACHE_NAMESPACE = "semantic-cache"

# --- INITIALIZATION ---
try:
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index = pc.Index(os.getenv("PINECONE_INDEX_NAME"))
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    cohere_key = os.getenv("COHERE_API_KEY")
    cohere_client = cohere.Client(cohere_key) if cohere_key else None
except Exception as e:
    print(f"Init Error: {e}")
    pc, index, openai_client, groq_client, cohere_client = None, None, None, None, None

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

def save_log(filepath, entry):
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
    try:
        name = raw_source.split('/')[-1].rsplit('.', 1)[0]
        name = re.sub(r'(?i)_compress|-compress|_final_version|_\d_\d|nbsped|factsheet', '', name)
        name = re.sub(r'\d{8,}', '', name) 
        return ' '.join(name.replace('_', ' ').replace('-', ' ').split()).title()
    except: return "Medical Reference"

@router.post("/chat")
async def chat_endpoint(request: ChatRequest, background_tasks: BackgroundTasks):
    if not groq_client: raise HTTPException(500, "AI tools not initialized")

    try:
        is_blood_work = request.clinical_data is not None
        lab_summary = ""
        missing_params_text = ""
        
        # 1. RETRIEVAL LOGIC
        if is_blood_work:
            lab_results = request.clinical_data.get("results", [])
            lab_summary = ", ".join([f"{r.get('name')}: {r.get('value')} {r.get('unit')}" for r in lab_results])
            search_query = f"Clinical implications of labs {lab_summary} for {request.treatment or 'fertility'}."
            
            check_prompt = f"Review labs: {lab_summary}. Identify missing from: FSH, AMH, LH, Estradiol, TSH, Prolactin. Return list or 'COMPLETE'."
            try:
                check_comp = groq_client.chat.completions.create(messages=[{"role": "user", "content": check_prompt}], model="llama-3.1-8b-instant", temperature=0.1)
                missing = check_comp.choices[0].message.content.strip()
                if "COMPLETE" not in missing.upper():
                    missing_params_text = f"\n\nNote: Mention that {missing} are missing but essential."
            except Exception: pass
        else:
            search_query = request.message

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
                background_tasks.add_task(save_log, DOC_USAGE_LOG_FILE, {"timestamp": datetime.now().isoformat(), "document": src})

        if highest_score < 0.3:
            background_tasks.add_task(save_log, GAP_LOG_FILE, {"timestamp": datetime.now().isoformat(), "question": search_query, "score": float(highest_score), "type": "Gap"})

        # 2. PROMPT GENERATION
        promo = "Include a brief recommendation for Izana's lifestyle plans." if request.interaction_count == 0 else "Do NOT promote Izana."
        
        system_prompt = f"""You are Izana AI. Context: Simple, detailed medical explanation.
        {promo} Always provide high medical detail. 
        CONTEXT: {context_text}"""

        draft_comp = groq_client.chat.completions.create(
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": search_query}],
            model="llama-3.3-70b-versatile",
            temperature=0.3
        )
        draft_response = draft_comp.choices[0].message.content

        # 3. ROBUST JSON FORMATTING (Fixes "No response received")
        qc_prompt = f"""Return ONLY a JSON object with 'revised_response' and 'suggested_questions' (list of 3).
        No markdown. Language: {request.language}.
        DRAFT: {draft_response}"""
        
        try:
            qc_comp = groq_client.chat.completions.create(
                messages=[{"role": "system", "content": qc_prompt}],
                model="llama-3.1-8b-instant",
                response_format={"type": "json_object"}
            )
            final_data = json.loads(qc_comp.choices[0].message.content)
            res_text = final_data.get("revised_response", draft_response)
            res_qs = final_data.get("suggested_questions", [])
        except Exception:
            res_text = draft_response
            res_qs = ["How can I improve my AMH?", "What are the next steps for IVF?", "Explain my FSH levels."]

        # HARD FALLBACK for empty strings
        if not str(res_text).strip():
            res_text = draft_response
        if not res_qs:
            res_qs = ["Tell me more about AMH.", "How does diet help?", "What is the success rate of IUI?"]

        return {
            "response": str(res_text).replace("**", "").replace("*", ""),
            "citations": citations,
            "suggested_questions": res_qs[:3]
        }
    except Exception as e:
        print(traceback.format_exc())
        return {"response": "I encountered a processing error. Could you please try again?", "citations": [], "suggested_questions": ["Try again"]}
