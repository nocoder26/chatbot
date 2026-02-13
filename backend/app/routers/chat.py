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

# --- FILE TO STORE UNANSWERED QUESTIONS ---
GAP_LOG_FILE = "/app/data/gap_logs.json"

# --- INITIALIZATION ---
try:
    # 1. Pinecone & OpenAI (for searching the database)
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index = pc.Index(os.getenv("PINECONE_INDEX_NAME"))
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    # 2. Groq (The High-Accuracy Medical Brain)
    groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    
    print("✅ STARTUP SUCCESS: Llama-3.3-70B Loaded via Groq")

except Exception as e:
    print(f"❌ STARTUP FAILED: {str(e)}")
    pc, index, openai_client, groq_client = None, None, None, None

class ChatRequest(BaseModel):
    message: str

def log_gap(question, context_strength):
    """
    Saves questions where the Knowledge Base was weak (Gap) 
    so you can review them in the Admin Panel.
    """
    entry = {
        "timestamp": datetime.now().isoformat(),
        "question": question,
        "context_score": float(context_strength),
        "status": "Gap Detected - Used General Knowledge"
    }
    
    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(GAP_LOG_FILE), exist_ok=True)
        
        logs = []
        if os.path.exists(GAP_LOG_FILE):
            with open(GAP_LOG_FILE, "r") as f:
                try:
                    content = f.read()
                    if content:
                        logs = json.loads(content)
                except:
                    pass
        
        logs.append(entry)
        
        # Keep only last 100 logs to save space
        if len(logs) > 100:
            logs = logs[-100:]
            
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
        search_resp = index.query(vector=vector, top_k=4, include_metadata=True)
        
        context_text = ""
        highest_score = 0.0
        citations = []
        
        for match in search_resp.matches:
            if match.score > highest_score:
                highest_score = match.score
            
            # Only use high-quality matches
            if match.score > 0.70 and match.metadata and "text" in match.metadata:
                source = match.metadata.get("source", "Medical Database")
                context_text += f"[Source: {source}]: {match.metadata['text']}\n\n"
                if source not in citations:
                    citations.append(source)

        # Step C: Detect Gap
        is_gap = False
        if highest_score < 0.75: # Threshold for "I'm not sure"
            is_gap = True
            log_gap(user_message, highest_score)
            context_text += "[Source: General Medical Knowledge]: (The specific fertility database had limited info, so I am supplementing with general high-accuracy medical knowledge.)\n"

        # Step D: Construct the Prompt (The Empathetic Caregiver)
        # Note: The f-string triple quotes are correctly closed below.
        system_prompt = f"""
        You are an empathetic, warm, and supportive fertility assistant for couples trying to conceive.
        Your tone should be gentle, hopeful, and professional (caregiver persona).
        
        INSTRUCTIONS:
        1. Use the provided CONTEXT to answer the user's question.
        2. If the context is empty or unrelated, use your own general medical knowledge (Llama 3.3) but explicitly state that this is general advice.
        3. CITATIONS: You must include [Source: Name] after every factual claim derived from the context.
        4. LEADING QUESTION: End every response with a single, short, helpful leading question to guide the user to the next step.
        5. SAFETY: If the user asks something unsafe, politely decline.

        CONTEXT:
        {context_text}
        """

        # Step E: Generate Answer
        completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            model="llama-3.3-70b-versatile", # High accuracy model
            temperature=0.3,
        )

        response_text = completion.choices[0].message.content

        return {
            "response": response_text,
            "is_gap": is_gap,
            "chat_id": int(datetime.now().timestamp()), # Simple ID for feedback
            "citations": citations
        }

    except Exception as e:
        print("--- 🔥 CHAT ERROR 🔥 ---")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

# --- NEW ADMIN ENDPOINT ---
# Access this at: https://your-railway-url.app/gaps
@router.get("/gaps")
async def get_gaps():
    if os.path.exists(GAP_LOG_FILE):
        with open(GAP_LOG_FILE, "r") as f:
            return json.load(f)
    return {"message": "No gaps recorded yet."}
