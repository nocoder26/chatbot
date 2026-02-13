import os
import re
import traceback
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from pinecone import Pinecone
from langchain_openai import OpenAIEmbeddings
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage

from app.database import get_db
from app.models import ChatLog
from app.services.translator import RunPodTranslator

router = APIRouter(prefix="/chat", tags=["chat"])

# Configuration
GAP_THRESHOLD = 0.75
TOP_K_RESULTS = 3
INDEX_NAME = "reproductive-health"

SYSTEM_PROMPT = """You are an empathetic and knowledgeable Reproductive Health Assistant.

Guidelines:
- Provide supportive, accurate information about reproductive health topics.
- NEVER provide medical diagnoses or specific treatment recommendations.
- Always encourage users to consult healthcare professionals for personal medical advice.
- Use the provided context to answer questions accurately.
- When citing facts from the context, append [Source: Filename] at the end of relevant statements.
- Be compassionate and non-judgmental in your responses.
- If the context doesn't contain relevant information, acknowledge limitations honestly.
- Keep responses clear, concise, and easy to understand."""


class ChatRequest(BaseModel):
    message: str
    language: str = "en"


class ChatResponse(BaseModel):
    response: str
    citations: List[str]
    chat_id: int
    is_gap: bool


# Initialize services
def get_translator():
    return RunPodTranslator()


def get_pinecone_index():
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    return pc.Index(INDEX_NAME)


def get_embeddings():
    return OpenAIEmbeddings(
        api_key=os.getenv("OPENAI_API_KEY"),
        model="text-embedding-ada-002",
    )


def get_groq_llm():
    return ChatGroq(
        api_key=os.getenv("GROQ_API_KEY"),
        model_name="llama3-70b-8192",
        temperature=0.7,
    )


async def search_pinecone(query: str, index, embeddings, top_k: int = TOP_K_RESULTS):
    """Search Pinecone for relevant context."""
    query_vector = embeddings.embed_query(query)

    results = index.query(
        vector=query_vector,
        top_k=top_k,
        include_metadata=True,
    )

    return results.matches


def extract_citations(matches) -> List[str]:
    """Extract unique source filenames from matches."""
    sources = set()
    for match in matches:
        if match.metadata and "source" in match.metadata:
            sources.add(match.metadata["source"])
    return list(sources)


def build_context(matches) -> str:
    """Build context string from Pinecone matches."""
    context_parts = []
    for match in matches:
        if match.metadata and "text" in match.metadata:
            source = match.metadata.get("source", "Unknown")
            text = match.metadata["text"]
            context_parts.append(f"[Source: {source}]\n{text}")
    return "\n\n".join(context_parts)


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Process a chat message and return an AI-generated response.

    Flow:
    1. Translate message to English (if needed)
    2. Search Pinecone for relevant context
    3. Generate response using Groq (Llama-3 70B)
    4. Translate response back to user's language
    5. Log interaction to database
    """
    try:
        print(f"CHAT REQUEST: message='{request.message}', language='{request.language}'")

        # Initialize services
        print("Initializing translator...")
        translator = get_translator()

        print(f"Initializing Pinecone with API key: {os.getenv('PINECONE_API_KEY')[:10] if os.getenv('PINECONE_API_KEY') else 'MISSING'}...")
        index = get_pinecone_index()

        print(f"Initializing OpenAI embeddings with API key: {os.getenv('OPENAI_API_KEY')[:10] if os.getenv('OPENAI_API_KEY') else 'MISSING'}...")
        embeddings = get_embeddings()

        print(f"Initializing Groq LLM with API key: {os.getenv('GROQ_API_KEY')[:10] if os.getenv('GROQ_API_KEY') else 'MISSING'}...")
        llm = get_groq_llm()
        # Step 1: Translate to English if not already
        print("Step 1: Processing language...")
        if request.language.lower() != "en":
            english_query = await translator.translate(request.message, "English")
            if english_query.startswith("[Translation Error]:"):
                english_query = request.message  # Fallback to original
        else:
            english_query = request.message
        print(f"English query: {english_query}")

        # Step 2: Search Pinecone
        print("Step 2: Searching Pinecone...")
        matches = await search_pinecone(english_query, index, embeddings)
        print(f"Found {len(matches)} matches")

        # Check for gap condition
        top_score = matches[0].score if matches else 0.0
        is_gap = top_score < GAP_THRESHOLD

        # Extract citations and build context
        citations = extract_citations(matches)
        context = build_context(matches)

        # Step 3: Generate response with Groq
        print("Step 3: Generating response with Groq...")
        user_prompt = f"""Context from knowledge base:
{context}

User Question: {english_query}

Please provide a helpful, empathetic response based on the context above."""

        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=user_prompt),
        ]

        ai_response = llm.invoke(messages)
        english_response = ai_response.content
        print(f"Groq response received: {len(english_response)} chars")

        # Step 4: Translate response back to user's language
        print("Step 4: Translating response...")
        if request.language.lower() != "en":
            final_response = await translator.translate(english_response, request.language)
            if final_response.startswith("[Translation Error]:"):
                final_response = english_response  # Fallback to English
        else:
            final_response = english_response

        # Step 5: Log to database
        print("Step 5: Logging to database...")
        chat_log = ChatLog(
            query=request.message,
            response=final_response,
            lang=request.language,
            is_gap=is_gap,
            score=top_score,
        )
        db.add(chat_log)
        db.commit()
        db.refresh(chat_log)
        print(f"Chat logged with ID: {chat_log.id}")

        print("SUCCESS: Returning response")
        return ChatResponse(
            response=final_response,
            citations=citations,
            chat_id=chat_log.id,
            is_gap=is_gap,
        )

    except Exception as e:
        # Log the full error to terminal for debugging
        print("=" * 50)
        print("CHAT ENDPOINT ERROR:")
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Message: {str(e)}")
        print("Full Traceback:")
        traceback.print_exc()
        print("=" * 50)
        raise HTTPException(status_code=500, detail=f"Chat processing error: {str(e)}")
