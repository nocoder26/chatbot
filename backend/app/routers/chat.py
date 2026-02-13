import os
import json
import traceback
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pinecone import Pinecone
from openai import OpenAI
from groq import Groq

router = APIRouter()

# --- FILE PATH FOR LOGGING GAPS ---
GAP_LOG_FILE = "gap_logs.json"

# --- INITIALIZATION ---
try:
    # 1. Pinecone & OpenAI (for searching your medical data)
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index = pc.Index(os.getenv("PINECONE_INDEX_NAME"))
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    # 2. Groq (The Open Source LLM Brain)
    # Using the powerful 70B model for best medical accuracy
    groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    
    print("✅ STARTUP SUCCESS: Llama-3.3-70B Loaded via Groq")

except Exception as e:
    print(f"❌ STARTUP FAILED: {str(e)}")
    pc, index, openai_client, groq_client = None, None, None, None

class ChatRequest(BaseModel):
    message: str

def log_gap(question, context_strength):
    """
    Saves questions where the Knowledge Base was weak (Gap) so Admin can see them.
    """
    entry = {
        "timestamp": datetime.now().isoformat(),
        "question": question,
        "context_found": context_strength > 0.0,
        "status": "Gap - LLM Knowledge Used"
    }
    
    # Simple file logging (In production, this would be a database)
    try:
        logs = []
        if os.path.exists(GAP_LOG_FILE):
            with open(GAP_LOG_FILE, "r") as f:
                try:
                    logs = json.load(f)
                except:
                    pass
        logs.append(entry)
        with open(GAP_LOG_FILE, "w") as f:
            json.dump(logs, f, indent=2)
    except Exception as e:
        print(f"⚠️ Failed to log gap: {e}")

@router.post("/chat")
async def chat_endpoint(request: ChatRequest):
    if not groq_client or not index:
        raise HTTPException(status_code=500, detail="AI tools not initialized.")

    try:
        user_message = request.message
        
        # Step A: Convert user message to a vector
        emb_resp = openai_client.embeddings.create(
            input=user_message,
            model="text-embedding-3-small"
        )
        vector = emb_resp.data[0].embedding

        # Step B: Search Knowledge Base
        search_resp = index.query(vector=vector, top_k=3, include_metadata=True)
        
        context_text = ""
        highest_score = 0.0
        
        for match in search_resp.matches:
            if match.score > highest_score:
                highest_score = match.score
            
            # Only include if relevance score is decent (e.g., > 0.70)
            if match.score > 0.70 and match.metadata and "text" in match.metadata:
                source = match.metadata.get("source", "Medical Database")
                context_text += f"[Source: {source}]: {match.metadata['text']}\n\n"

        # Step C: Detect Gap
        is_gap = False
        if highest_score < 0.75: # Threshold for "I'm not sure"
            is_gap = True
            log_gap(user_message, highest_score)
            context_text += "[Source: General Medical Knowledge]: (The database had limited info, so I am supplementing with general fertility knowledge.)\n"

        # Step D: Construct the Prompt
        system_prompt = f"""
        You are an empathetic, warm, and supportive fertility assistant for couples trying to conceive.
        Your tone should be gentle, hopeful, and professional (caregiver persona).
        
        INSTRUCTIONS:
        1. Use the provided CONTEXT to answer the user's question.
        2. If the context is empty or unrelated, use your own general medical knowledge but explicitly state that this is general advice.
        3. CITATIONS: You must include [Source: Name
