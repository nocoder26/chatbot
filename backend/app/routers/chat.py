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
    # NEW: Added fields for blood work analysis
    clinical_data: Optional[Dict[str, Any]] = None
    treatment: Optional[str] = None

class FeedbackRequest(BaseModel):
    question: str
    answer: str
    rating: int
    reason: str = ""
    suggested_questions: list = []

def cleanup_logs():
    try:
        cutoff = datetime.now() - timedelta(hours=24)
        for filepath in [GAP_LOG_FILE, FEEDBACK_LOG_FILE]:
            if os.path.exists(filepath):
                with open(filepath, "r") as f:
                    logs = json.load(f)
                new_logs = [log for log in logs if datetime.fromisoformat(log["timestamp"]) > cutoff]
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
        if len(logs) > 100: logs = logs[-100:]
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
        # --- NEW: BLOOD WORK ANALYSIS BRANCH ---
        is_blood_work = request.clinical_data is not None
        
        if is_blood_work:
            # Format the lab results into a readable string for the embedding
            lab_results = request.clinical_data.get("results", [])
            lab_summary = ", ".join([f"{r.get('name')}: {r.get('value')} {r.get('unit')}" for r in lab_results])
            treatment_context = request.treatment or "General Fertility"
            
            # Create a specific search query based on their labs and treatment
            search_query = f"What are the implications of these lab results: {lab_summary} for a patient undergoing {treatment_context}?"
            expanded_queries = [search_query]
        else:
            # 1. STANDARD MULTI-QUERY
            try:
                mq_prompt = f"Generate 2 alternative search queries to maximize medical document retrieval for: '{request.message}'. Return ONLY the 2 queries separated by a newline."
                mq_completion = groq_client.chat.completions.create(
                    messages=[{"role": "user", "content": mq_prompt}],
                    model="llama-3.1-8b-instant",
                    temperature=0.2
                )
                expanded_queries = [request.message] + [q.strip() for q in mq_completion.choices[0].message.content.split('\n') if q.strip()]
                expanded_queries = expanded_queries[:3]
            except Exception:
                expanded_queries = [request.message] 

        # 2. EMBEDDING
        emb_resp = openai_client.embeddings.create(input=expanded_queries, model="text-embedding-ada-002")
        vectors = [item.embedding for item in emb_resp.data]

        # 3. CACHE CHECK (Skip cache if it's personalized blood work)
        if not is_blood_work:
            cache_resp = index.query(namespace=CACHE_NAMESPACE, vector=vectors[0], top_k=1, include_metadata=True)
            if cache_resp.matches and cache_resp.matches[0].score > 0.95:
                cached_meta = cache_resp.matches[0].metadata
                try: cached_qs = json.loads(cached_meta.get("suggested_questions", "[]"))
                except: cached_qs = []
                return {
                    "response": cached_meta["response"],
                    "citations": ["Verified Community Answer"],
                    "suggested_questions": cached_qs,
                    "is_gap": False
                }

        # 4. RETRIEVAL (TEXTBOOKS ONLY)
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
                doc_sources.append(match.metadata.get('source', match.metadata.get('type', 'Medical Database')))

        context_text, citations, highest_score = "", [], 0.0

        # 5. RERANKING
        try:
            if cohere_client and doc_texts:
                query_for_rerank = search_query if is_blood_work else request.message
                rerank_resp = cohere_client.rerank(model="rerank-multilingual-v3.0", query=query_for_rerank, documents=doc_texts, top_n=4)
                for r in rerank_resp.results:
                    if r.relevance_score > highest_score: highest_score = r.relevance_score
                    if r.relevance_score > 0.3:
                        idx = r.index
                        src = clean_citation(doc_sources[idx])
                        context_text += f"Info from {src}: {doc_texts[idx]}\n\n"
                        if src not in citations: citations.append(src)
        except Exception:
            sorted_matches = sorted(unique_docs.values(), key=lambda x: x.score, reverse=True)
            highest_score = sorted_matches[0].score if sorted_matches else 0.0
            for match in sorted_matches[:4]:
                if match.score > 0.75:
                    src = clean_citation(match.metadata.get("source", match.metadata.get('type', 'Medical Database')))
                    context_text += f"Info from {src}: {match.metadata.get('text', '')}\n\n"
                    if src not in citations: citations.append(src)

        # GAP LOGGING
        is_gap = highest_score < 0.3
        if is_gap:
            gap_type = "Blood Work Gap" if is_blood_work else "General Gap"
            gap_question = f"Missing context for labs: {lab_summary}" if is_blood_work else request.message
            background_tasks.add_task(save_log, GAP_LOG_FILE, {"timestamp": datetime.now().isoformat(), "question": gap_question, "score": float(highest_score), "type": gap_type})
            context_text += "Note: Specific medical data in the textbook was limited. Provide general medical insights based on LLM knowledge.\n"

        # 6. DRAFT (70B) 
        if is_blood_work:
            draft_prompt = f"""
            You are an empathetic reproductive health assistant. Language: {request.language}.
            
            PATIENT PROFILE:
            - Lab Results: {lab_summary}
            - Planned Treatment: {treatment_context}
            
            TASK:
            1. Analyze what these specific lab results mean in the context of their planned treatment based on the provided CONTEXT.
            2. PROVIDE INSIGHTS ONLY. Explicitly state you cannot diagnose.
            3. Actionable Steps: Suggest 2-3 lifestyle modifications (diet, exercise, stress) that generally improve reproductive health for this profile.
            
            CRITICAL RULES:
            - NO FIRST-PERSON PRONOUNS. Talk in the third person plural (e.g., "healthcare providers", "clinics", "they").
            - PLAIN TEXT ONLY. DO NOT use markdown, bold, or asterisks.
            - CONCISE: Be direct and supportive.
            
            CONTEXT: {context_text}
            """
        else:
            draft_prompt = f"""
            Answer the following medical question based strictly on the CONTEXT. Language: {request.language}.
            
            CRITICAL RULES:
            1. NO FIRST-PERSON PRONOUNS. Do not use "we", "our", "us", or "I". Talk in the third person plural (e.g., "healthcare providers", "they").
            2. NO EM-DASHES. Do not use —.
            3. PLAIN TEXT ONLY. DO NOT use markdown, bold, or asterisks.
            4. CONCISE: Be direct. Do not loop or repeat yourself.
            
            CONTEXT: {context_text}
            """

        draft_completion = groq_client.chat.completions.create(
            messages=[{"role": "system", "content": draft_prompt}, {"role": "user", "content": request.message}],
            model="llama-3.3-70b-versatile",
            temperature=0.2,
            max_tokens=800, 
            frequency_penalty=0.4 
        )
        draft_response = draft_completion.choices[0].message.content

        # 7. QC FORMATTER (8B) 
        try:
            qc_prompt = f"""
            You are a JSON formatting tool. Read the DRAFT RESPONSE below.
            Language: {request.language}.

            TASK:
            1. Keep the exact tone of the draft. STRICTLY use third-person ("healthcare providers", "they").
            2. Remove any bullet points, asterisks (*), bold marks (**), or em-dashes (—). Plain text ONLY.
            3. Break the text into short, easy-to-read paragraphs separated by double blank lines.
            4. Generate 3 clickable leading questions relevant to the text.
            5. CRITICAL: DO NOT repeat any sentences. Stop generating when the thought is complete.
            
            DRAFT RESPONSE:
            {draft_response}

            OUTPUT FORMAT:
            Return ONLY a JSON object:
            {{
                "revised_response": "The plain text response here. A SINGLE STRING.",
                "suggested_questions": ["Q1", "Q2", "Q3"]
            }}
            """
            qc_completion = groq_client.chat.completions.create(
                messages=[{"role": "system", "content": qc_prompt}],
                model="llama-3.1-8b-instant",
                temperature=0.3,
                max_tokens=600,
                frequency_penalty=0.6, 
                presence_penalty=0.2,
                response_format={"type": "json_object"}
            )
            final_data = json.loads(qc_completion.choices[0].message.content)
            
            raw_response = final_data.get("revised_response", draft_response)
            if isinstance(raw_response, list):
                final_response = "\n\n".join([str(p) for p in raw_response])
            elif isinstance(raw_response, dict):
                final_response = "\n\n".join([str(v) for v in raw_response.values()])
            else:
                final_response = str(raw_response)
                
            final_response = final_response.replace("**", "").replace("*", "").replace("—", "-")
                
            suggested_questions = final_data.get("suggested_questions", [])
            if not isinstance(suggested_questions, list):
                suggested_questions = []

        except Exception as e:
            final_response = str(draft_response).replace("**", "").replace("*", "")
            suggested_questions = ["What are the next steps?", "How long does the process take?", "Are there any side effects?"]

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
async def submit_feedback(feedback: FeedbackRequest, background_tasks: BackgroundTasks):
    entry = {
        "timestamp": datetime.now().isoformat(),
        "rating": feedback.rating,
        "question": feedback.question,
        "reason": feedback.reason
    }
    background_tasks.add_task(save_log, FEEDBACK_LOG_FILE, entry)

    if feedback.rating == 5:
        try:
            emb_resp = openai_client.embeddings.create(input=feedback.question, model="text-embedding-ada-002")
            vector = emb_resp.data[0].embedding
            index.upsert(
                vectors=[{"id": str(uuid.uuid4()), "values": vector, "metadata": {"question": feedback.question, "response": feedback.answer, "suggested_questions": json.dumps(feedback.suggested_questions)}}],
                namespace=CACHE_NAMESPACE
            )
        except Exception:
            pass
    return {"status": "Recorded"}

@router.get("/admin/stats")
async def get_stats():
    gaps, feedback = [], []
    for log_file, target_list in [(GAP_LOG_FILE, gaps), (FEEDBACK_LOG_FILE, feedback)]:
        if os.path.exists(log_file):
            with open(log_file) as f: 
                try: target_list.extend(json.load(f))
                except: pass
    return {"gaps": gaps, "feedback": feedback}
