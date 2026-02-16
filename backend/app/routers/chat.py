import os
import json
import uuid
import logging
import re
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel, Field
from pinecone import Pinecone
from openai import OpenAI
from groq import Groq
import cohere
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger("izana.chat")

router = APIRouter()

# --- CONFIGURATION ---
GAP_LOG_FILE = os.getenv("GAP_LOG_FILE", "/tmp/gap_logs.json")
FEEDBACK_LOG_FILE = os.getenv("FEEDBACK_LOG_FILE", "/tmp/feedback_logs.json")
DOC_USAGE_LOG_FILE = os.getenv("DOC_USAGE_LOG_FILE", "/tmp/doc_usage_logs.json")
GAP_SCORE_THRESHOLD = float(os.getenv("GAP_SCORE_THRESHOLD", "0.3"))
MAX_MESSAGE_LENGTH = int(os.getenv("MAX_MESSAGE_LENGTH", "2000"))
RERANK_TOP_N = int(os.getenv("RERANK_TOP_N", "3"))
CACHE_NAMESPACE = "semantic-cache"

DRAFT_MODEL = os.getenv("DRAFT_MODEL", "llama-3.3-70b-versatile")
QC_MODEL = os.getenv("QC_MODEL", "llama-3.1-8b-instant")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-ada-002")

# --- LANGUAGE MAPPING ---
SUPPORTED_LANGUAGES = {
    "en": "English",
    "ta": "Tamil",
    "hi": "Hindi",
    "te": "Telugu",
    "ml": "Malayalam",
    "es": "Spanish",
    "ja": "Japanese",
}

# --- CORE AI INITIALIZATION ---
pc = None
index = None
openai_client = None
groq_client = None
cohere_client = None

try:
    pinecone_key = os.getenv("PINECONE_API_KEY")
    pinecone_index = os.getenv("PINECONE_INDEX_NAME")
    if pinecone_key and pinecone_index:
        pc = Pinecone(api_key=pinecone_key)
        index = pc.Index(pinecone_index)
        logger.info("Pinecone initialized")
    else:
        logger.warning("Pinecone not configured (missing PINECONE_API_KEY or PINECONE_INDEX_NAME)")

    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        openai_client = OpenAI(api_key=openai_key)
        logger.info("OpenAI initialized")
    else:
        logger.warning("OpenAI not configured (missing OPENAI_API_KEY)")

    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        groq_client = Groq(api_key=groq_key)
        logger.info("Groq initialized")
    else:
        logger.warning("Groq not configured (missing GROQ_API_KEY)")

    cohere_key = os.getenv("COHERE_API_KEY")
    if cohere_key:
        cohere_client = cohere.ClientV2(api_key=cohere_key)
        logger.info("Cohere reranker initialized")
    else:
        logger.warning("Cohere not configured (missing COHERE_API_KEY) - reranking disabled")

except Exception as e:
    logger.error(f"Critical initialization error: {e}", exc_info=True)


# --- REQUEST/RESPONSE MODELS ---
class ChatRequest(BaseModel):
    message: str = Field(..., max_length=MAX_MESSAGE_LENGTH)
    language: str = Field(default="en", description="ISO language code")
    clinical_data: Optional[Dict[str, Any]] = None
    treatment: Optional[str] = None


class FeedbackRequest(BaseModel):
    question: str = Field(..., max_length=MAX_MESSAGE_LENGTH)
    answer: str
    rating: int = Field(..., ge=1, le=5)
    reason: str = ""
    suggested_questions: list = []


class ChatResponse(BaseModel):
    response: str
    citations: List[str]
    suggested_questions: List[str]


# --- UTILITIES ---
def save_log(filepath: str, entry: dict) -> None:
    """JSON logger with rotation for production stability."""
    try:
        logs = []
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                content = f.read()
                if content:
                    logs = json.loads(content)
        logs.append(entry)
        if len(logs) > 500:
            logs = logs[-500:]
        with open(filepath, "w") as f:
            json.dump(logs, f, indent=2)
    except (json.JSONDecodeError, OSError) as e:
        logger.error(f"Failed to write log to {filepath}: {e}")


def clean_citation(raw_source: str) -> str:
    """Formats file paths into clean document titles for citations."""
    if not raw_source:
        return "Medical Reference"
    try:
        name = raw_source.split('/')[-1].rsplit('.', 1)[0]
        name = re.sub(r'(?i)_compress|-compress|_final_version|_\d_\d|nbsped|factsheet', '', name)
        name = re.sub(r'\d{8,}', '', name)
        return ' '.join(name.replace('_', ' ').replace('-', ' ').split()).title()
    except Exception as e:
        logger.warning(f"Citation cleaning failed for '{raw_source}': {e}")
        return "Medical Reference"


def sanitize_input(text: str) -> str:
    """Basic input sanitization to reduce prompt injection risk."""
    danger_patterns = [
        r'(?i)ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)',
        r'(?i)you\s+are\s+now\s+',
        r'(?i)system\s*:\s*',
        r'(?i)forget\s+(everything|all|your)',
        r'(?i)new\s+instructions?\s*:',
        r'(?i)override\s+(your|the|all)',
    ]
    cleaned = text
    for pattern in danger_patterns:
        cleaned = re.sub(pattern, '[filtered]', cleaned)
    return cleaned.strip()


def rerank_results(query: str, documents: list) -> list:
    """Use Cohere to rerank search results for better relevance."""
    if not cohere_client or not documents:
        return documents

    try:
        doc_texts = [
            doc.metadata.get('text', '') for doc in documents if doc.metadata.get('text')
        ]
        if not doc_texts:
            return documents

        rerank_response = cohere_client.rerank(
            model="rerank-v3.5",
            query=query,
            documents=doc_texts,
            top_n=min(RERANK_TOP_N, len(doc_texts))
        )

        reranked = []
        for result in rerank_response.results:
            original_match = documents[result.index]
            original_match.score = result.relevance_score
            reranked.append(original_match)

        return reranked

    except Exception as e:
        logger.warning(f"Reranking failed, using original order: {e}")
        return documents


async def translate_with_groq(text: str, target_language: str) -> str:
    """Translate text using Groq LLM for supported languages."""
    if not groq_client or target_language == "English":
        return text

    try:
        translation_prompt = f"""Translate the following medical text into {target_language}. 
Preserve all medical terminology accurately. Return ONLY the translated text with no extra explanation.

Text to translate:
{text}"""

        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": translation_prompt}],
            model=QC_MODEL,
            temperature=0.1,
            max_tokens=2000
        )
        translated = completion.choices[0].message.content.strip()
        if translated and len(translated) > 5:
            return translated
        return text
    except Exception as e:
        logger.warning(f"Translation to {target_language} failed: {e}")
        return text


async def retry_api_call(func, max_retries=3, delay=1):
    """Retry an API call with exponential backoff. Pass function as lambda."""
    for attempt in range(max_retries):
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, func)
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait_time = delay * (2 ** attempt)
            logger.warning(f"API call failed (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {wait_time}s...")
            await asyncio.sleep(wait_time)


# --- MAIN CHAT ENDPOINT ---
limiter = Limiter(key_func=get_remote_address)


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: Request, chat_request: ChatRequest, background_tasks: BackgroundTasks):
    if not groq_client or not openai_client or not index:
        raise HTTPException(status_code=503, detail="AI services not fully initialized")

    try:
        is_blood_work = chat_request.clinical_data is not None
        lab_summary = ""
        missing_params_text = ""
        language_name = SUPPORTED_LANGUAGES.get(chat_request.language, "English")
        user_message = sanitize_input(chat_request.message)

        # 1. BUILD SEARCH QUERY
        if is_blood_work:
            lab_results = chat_request.clinical_data.get("results", [])
            lab_summary = ", ".join([
                f"{r.get('name')}: {r.get('value')} {r.get('unit')}"
                for r in lab_results
            ])
            search_query = f"Clinical implications of fertility labs: {lab_summary} for {chat_request.treatment or 'fertility'}."

            check_prompt = (
                f"Check labs: {lab_summary}. "
                "Identify any missing from: FSH, AMH, LH, Estradiol, TSH, Prolactin. "
                "Return the missing names as a comma-separated list, or 'COMPLETE' if all present."
            )
            try:
                check_comp = await retry_api_call(
                    lambda: groq_client.chat.completions.create(
                        messages=[{"role": "user", "content": check_prompt}],
                        model=QC_MODEL,
                        temperature=0.1,
                        max_tokens=100
                    ),
                    max_retries=2
                )
                missing = check_comp.choices[0].message.content.strip()
                if "COMPLETE" not in missing.upper():
                    missing_params_text = (
                        f"\n\nNote: Gently inform the user that {missing} are missing "
                        "but are important for a comprehensive evaluation."
                    )
            except Exception as e:
                logger.warning(f"Missing marker check failed: {e}")
        else:
            search_query = user_message

        # 2. SEMANTIC SEARCH + RERANKING
        try:
            emb_resp = await retry_api_call(
                lambda: openai_client.embeddings.create(
                    input=[search_query],
                    model=EMBEDDING_MODEL
                ),
                max_retries=3
            )
            vector = emb_resp.data[0].embedding
            search_resp = await retry_api_call(
                lambda: index.query(vector=vector, top_k=8, include_metadata=True),
                max_retries=3
            )
        except Exception as e:
            logger.error(f"Search/embedding failed: {e}", exc_info=True)
            raise HTTPException(
                status_code=503,
                detail="Search service temporarily unavailable. Please try again in a moment."
            )

        reranked_matches = rerank_results(search_query, search_resp.matches)

        context_text = ""
        citations = []
        highest_score = 0.0

        for match in reranked_matches:
            score = match.score if hasattr(match, 'score') else 0.0
            if score > highest_score:
                highest_score = score
            src = clean_citation(match.metadata.get('source', 'Medical Database'))
            context_text += f"From {src}: {match.metadata.get('text', '')}\n\n"
            if src not in citations:
                citations.append(src)
                background_tasks.add_task(
                    save_log, DOC_USAGE_LOG_FILE,
                    {"timestamp": datetime.now().isoformat(), "document": src}
                )

        if highest_score < GAP_SCORE_THRESHOLD:
            background_tasks.add_task(
                save_log, GAP_LOG_FILE,
                {
                    "timestamp": datetime.now().isoformat(),
                    "question": search_query,
                    "score": float(highest_score),
                    "type": "Blood Work Gap" if is_blood_work else "Gap"
                }
            )

        # 3. GENERATE RESPONSE
        system_prompt = f"""You are Izana AI, a medical information assistant specialized in reproductive health and fertility.
Always provide detailed, evidence-based medical context. Speak in the third-person plural ("we recommend", "patients should").
Always include a disclaimer that this is informational and not a substitute for professional medical advice.

CONTEXT FROM MEDICAL KNOWLEDGE BASE:
{context_text}
{missing_params_text}"""

        try:
            draft_comp = await retry_api_call(
                lambda: groq_client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": search_query}
                    ],
                    model=DRAFT_MODEL,
                    temperature=0.3
                ),
                max_retries=3
            )
            draft_response = draft_comp.choices[0].message.content
        except Exception as e:
            logger.error(f"Draft generation failed: {e}", exc_info=True)
            raise HTTPException(
                status_code=503,
                detail="AI service temporarily unavailable. Please try again in a moment."
            )

        # 4. STRUCTURED OUTPUT WITH FOLLOW-UP QUESTIONS
        try:
            qc_prompt = f"""Return ONLY a valid JSON object with this structure:
{{"revised_response": "the full medical response text", "suggested_questions": ["question 1", "question 2", "question 3"]}}

Rules:
- revised_response: Clean up the draft. Remove all markdown formatting (**, *, #). Keep it professional and thorough.
- suggested_questions: Generate exactly 3 relevant follow-up questions the patient might ask next based on the topic.
- Language: Respond in {language_name}.

Draft to process:
{draft_response}"""

            qc_comp = await retry_api_call(
                lambda: groq_client.chat.completions.create(
                    messages=[{"role": "user", "content": qc_prompt}],
                    model=QC_MODEL,
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=2000
                ),
                max_retries=2
            )
            final_data = json.loads(qc_comp.choices[0].message.content)
            res_text = final_data.get("revised_response", "")
            res_qs = final_data.get("suggested_questions", [])

            if not res_text or len(str(res_text)) < 10:
                raise ValueError("Incomplete model output from QC step")

        except Exception as e:
            logger.warning(f"QC formatting failed, using draft: {e}")
            res_text = draft_response
            res_qs = [
                "What are the next steps for my treatment?",
                "How does lifestyle affect these results?",
                "What other tests should I consider?"
            ]

        # 5. TRANSLATE IF NEEDED
        if language_name != "English":
            res_text = await translate_with_groq(res_text, language_name)
            translated_qs = []
            for q in res_qs[:3]:
                translated_q = await translate_with_groq(q, language_name)
                translated_qs.append(translated_q)
            res_qs = translated_qs

        clean_text = re.sub(r'[*#]+', '', str(res_text)).strip()

        return ChatResponse(
            response=clean_text,
            citations=citations,
            suggested_questions=res_qs[:3]
        )

    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Chat processing error: {error_msg}", exc_info=True)
        
        # Provide more helpful error messages based on error type
        if "503" in error_msg or "service" in error_msg.lower() or "unavailable" in error_msg.lower():
            user_message = "The AI service is temporarily unavailable. Please try again in a few moments."
        elif "rate limit" in error_msg.lower() or "quota" in error_msg.lower():
            user_message = "We're experiencing high demand. Please wait a moment and try again."
        elif "timeout" in error_msg.lower():
            user_message = "The request took too long to process. Please try again with a shorter question."
        else:
            user_message = "We encountered a processing error. Could you please try asking your question again?"
        
        return ChatResponse(
            response=user_message,
            citations=[],
            suggested_questions=[
                "What is IVF?",
                "How to improve fertility?",
                "Tell me about fertility testing."
            ]
        )


@router.post("/feedback")
async def submit_feedback(feedback: FeedbackRequest, background_tasks: BackgroundTasks):
    """Submit feedback on a chat response. 5-star ratings are cached for future retrieval."""
    entry = {
        "timestamp": datetime.now().isoformat(),
        "rating": feedback.rating,
        "question": feedback.question,
        "reason": feedback.reason
    }
    background_tasks.add_task(save_log, FEEDBACK_LOG_FILE, entry)

    if feedback.rating == 5 and openai_client and index:
        try:
            emb_resp = openai_client.embeddings.create(
                input=feedback.question,
                model=EMBEDDING_MODEL
            )
            index.upsert(
                vectors=[{
                    "id": str(uuid.uuid4()),
                    "values": emb_resp.data[0].embedding,
                    "metadata": {
                        "question": feedback.question,
                        "response": feedback.answer,
                        "suggested_questions": json.dumps(feedback.suggested_questions)
                    }
                }],
                namespace=CACHE_NAMESPACE
            )
        except Exception as e:
            logger.warning(f"Semantic cache upsert failed: {e}")

    return {"status": "Recorded"}
