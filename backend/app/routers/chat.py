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

# --- CONFIG ---
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
    cohere_key = os.getenv("COHERE_API_KEY", "8LT29K24AsAQZbJCYlvz4eHPTtN5duyZkQF1QtXw")
    cohere_client = cohere.Client(cohere_key) if cohere_key else None
    print("✅ STARTUP SUCCESS: Fail-Safe AI Pipeline Ready")
except Exception as e:
    print(f"❌ STARTUP FAILED: {str(e)}")
    pc, index, openai_client, groq_client, cohere_client = None, None, None, None, None

class ChatRequest(BaseModel):
    message: str
    language: str = "English"
    clinical_data: Optional[Dict[str, Any]] = None
    treatment: Optional[str] = None
    interaction_count: int = 0 # NEW: Track conversation depth

class FeedbackRequest(BaseModel):
    question: str
    answer: str
    rating: int
    reason: str = ""
    suggested_questions: list = []

def cleanup_logs():
    try:
        cutoff = datetime.now() - timedelta(hours=24)
        for filepath in [GAP_LOG_FILE, FEEDBACK_LOG_FILE, DOC_USAGE_LOG_FILE]:
            if os.path.exists(filepath):
                with open(filepath, "r") as f:
                    logs = json.load(f)
                new_logs = [log for log in logs if datetime.fromisoformat(log.get("timestamp", datetime.now().isoformat())) > cutoff]
                with open(filepath, "w") as f:
                    json.dump(new_logs, f, indent=2)
    except Exception:
        pass

def save_log(filepath, entry):
    try:
        logs = []
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                content = f.read()
                if content:
                    logs = json.loads(content)
        logs.append(entry)
        if len(logs) > 500: logs = logs[-500:]
        with open(filepath, "w") as f:
            json.dump(logs, f, indent=2)
    except Exception:
        pass

def clean_citation(raw_source: str) -> str:
    try:
        name = raw_source.split('/')[-1]
        name = name.rsplit('.', 1)[0]
        name = re.sub(r'(?i)_compress|-compress|_final_version|_\d_\d|nbsped|factsheet', '', name)
        name = re.sub(r'\d{8,}', '', name) 
        name = name.replace('_', ' ').replace('-', ' ')
        return ' '.join(name.split()).title()
    except:
        return "Medical Reference Document"

@router.post("/chat")
async def chat_endpoint(request: ChatRequest, background_tasks: BackgroundTasks):
    if not groq_client: raise HTTPException(500, "AI tools not initialized")
    background_tasks.add_task(cleanup_logs)

    try:
        is_blood_work = request.clinical_data is not None
        missing_params_text = ""
        
        if is_blood_work:
            lab_results = request.clinical_data.get("results", [])
            lab_summary = ", ".join([f"{r.get('name')}: {r.get('value')} {r.get('unit')}" for r in lab_results])
            treatment_context = request.treatment or "General Fertility"
            
            check_prompt = f"Review labs: {lab_summary}. Identify missing from: FSH, AMH, LH, Estradiol, TSH, Prolactin. Return list or 'COMPLETE'."
            try:
                check_comp = groq_client.chat.completions.create(
                    messages=[{"role": "user", "content": check_prompt}],
                    model="llama-3.1-8b-instant",
                    temperature=0.1
                )
                missing = check_comp.choices[0].message.content.strip()
                if "COMPLETE" not in missing.upper():
                    missing_params_text = f"\n\nNote: Gentle alert to user that {missing} are missing but important for full fertility context."
            except Exception: pass
            
            search_query = f"Fertility lab analysis: {lab_summary} for {treatment_context}."
            expanded_queries = [search_query]
        else:
            try:
                mq_prompt = f"Generate 2 medical search queries for: '{request.message}'."
                mq_completion = groq_client.chat.completions.create(
                    messages=[{"role": "user", "content": mq_prompt}],
                    model="llama-3.1-8b-instant",
                    temperature=0.2
                )
                expanded_queries = [request.message] + [q.strip() for q in mq_completion.choices[0].message.content.split('\n') if q.strip()]
            except Exception:
                expanded_queries = [request.message] 

        emb_resp = openai_client.embeddings.create(input=expanded_queries, model="text-embedding-ada-002")
        vectors = [item.embedding for item in emb_resp.data]

        if not is_blood_work:
            cache_resp = index.query(namespace=CACHE_NAMESPACE, vector=vectors[0], top_k=1, include_metadata=True)
            if cache_resp.matches and cache_resp.matches[0].score > 0.95:
                cached_meta = cache_resp.matches[0].metadata
                return {"response": cached_meta["response"], "citations": ["Verified Community Answer"], "suggested_questions": json.loads(cached_meta.get("suggested_questions", "[]")), "is_gap": False}

        unique_docs = {}
        for vec in vectors:
            search_resp = index.query(vector=vec, top_k=5, include_metadata=True)
            for match in search_resp.matches:
                unique_docs[match.id] = match

        doc_texts, doc_sources = [], []
        for match in unique_docs.values():
            txt = match.metadata.get('text', '')
            if txt not in doc_texts:
                doc_texts.append(txt)
                doc_sources.append(match.metadata.get('source', 'Medical Database'))

        context_text, citations, highest_score = "", [], 0.0

        if cohere_client and doc_texts:
            query_for_rerank = search_query if is_blood_work else request.message
            rerank_resp = cohere_client.rerank(model="rerank-multilingual-v3.0", query=query_for_rerank, documents=doc_texts, top_n=4)
            for r in rerank_resp.results:
                if r.relevance_score > highest_score: highest_score = r.relevance_score
                if r.relevance_score > 0.25:
                    idx = r.index
                    src = clean_citation(doc_sources[idx])
                    context_text += f"Info from {src}: {doc_texts[idx]}\n\n"
                    if src not in citations: 
                        citations.append(src)
                        background_tasks.add_task(save_log, DOC_USAGE_LOG_FILE, {"timestamp": datetime.now().isoformat(), "document": src})
        
        is_gap = highest_score < 0.3
        if is_gap:
            background_tasks.add_task(save_log, GAP_LOG_FILE, {"timestamp": datetime.now().isoformat(), "question": search_query if is_blood_work else request.message, "score": float(highest_score), "type": "Blood Work Gap" if is_blood_work else "General Gap"})

        # --- DYNAMIC PROMOTION REDUCTION ---
        promo_rule = ""
        if request.interaction_count == 0:
            promo_rule = "Encourage them to check Izana's personalized nutrition and lifestyle plans."
        else:
            promo_rule = "STRICT: Do NOT mention Izana plans or provide platform promotion. Focus purely on answering the question."

        if is_blood_work:
            draft_prompt = f"""
            You are Izana AI. Context: simple, comforting couple-centric fertility lab analysis.
            {promo_rule}
            Target: {treatment_context}. Labs: {lab_summary}. {missing_params_text}
            CONTEXT: {context_text}
            """
        else:
            draft_prompt = f"""
            You are Izana AI. Answer strictly based on CONTEXT.
            {promo_rule}
            CONTEXT: {context_text}
            """

        draft_completion = groq_client.chat.completions.create(
            messages=[{"role": "system", "content": draft_prompt}, {"role": "user", "content": request.message}],
            model="llama-3.3-70b-versatile",
            temperature=0.2,
            max_tokens=850
        )
        draft_response = draft_completion.choices[0].message.content

        qc_prompt = f"""
        JSON formatting tool. Response language: {request.language}.
        Task: 1. Third-person only. 2. Remove markdown/formatting. 3. Short paragraphs.
        4. Generate 3 conversational follow-up questions relevant to: {draft_response}.
        DRAFT: {draft_response}
        """
        qc_completion = groq_client.chat.completions.create(
            messages=[{"role": "system", "content": qc_prompt}],
            model="llama-3.1-8b-instant",
            response_format={"type": "json_object"}
        )
        final_data = json.loads(qc_completion.choices[0].message.content)
        
        return {
            "response": final_data.get("revised_response", draft_response).replace("**", "").replace("*", "").replace("—", "-"),
            "citations": citations,
            "is_gap": is_gap,
            "suggested_questions": final_data.get("suggested_questions", [])
        }

    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(500, str(e))

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
    gaps, feedback, usage = [], [], []
    for log_file, target_list in [(GAP_LOG_FILE, gaps), (FEEDBACK_LOG_FILE, feedback), (DOC_USAGE_LOG_FILE, usage)]:
        if os.path.exists(log_file):
            with open(log_file) as f: 
                try: target_list.extend(json.load(f))
                except: pass
    return {"gaps": gaps, "feedback": feedback, "doc_usage": usage}
