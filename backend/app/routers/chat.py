import os
import traceback
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pinecone import Pinecone
from openai import OpenAI

router = APIRouter()

# --- DIAGNOSTIC STARTUP ---
# This prints to Railway logs immediately so we know if keys are wrong
print("--- SYSTEM STARTUP CHECK ---")
try:
    # 1. Setup Pinecone
    api_key = os.getenv("PINECONE_API_KEY")
    env = os.getenv("PINECONE_ENVIRONMENT")
    index_name = os.getenv("PINECONE_INDEX_NAME")
    
    print(f"Pinecone Config: Env={env}, Index={index_name}, KeyLength={len(api_key) if api_key else 0}")
    
    pc = Pinecone(api_key=api_key)
    index = pc.Index(index_name)
    
    # 2. Setup OpenAI
    openai_key = os.getenv("OPENAI_API_KEY")
    print(f"OpenAI Config: KeyLength={len(openai_key) if openai_key else 0}")
    client = OpenAI(api_key=openai_key)
    
    print("✅ STARTUP SUCCESS: AI Tools Loaded")

except Exception as e:
    print(f"❌ STARTUP FAILED: {str(e)}")
    print(traceback.format_exc())
    # We don't crash here so the server stays alive to report the error
    pc, index, client = None, None, None

class ChatRequest(BaseModel):
    message: str

@router.post("/chat")
async def chat_endpoint(request: ChatRequest):
    print(f"📩 RECEIVED MESSAGE: {request.message}")

    # 1. Fail fast if startup failed
    if not client or not index:
        print("⛔ BLOCKING REQUEST: System not initialized")
        raise HTTPException(status_code=500, detail="Server failed to start AI tools. Check Railway logs.")

    try:
        # 2. Get Embedding (Simple, standard model)
        # We use text-embedding-3-small because it fits your 1536 index
        emb_resp = client.embeddings.create(
            input=request.message,
            model="text-embedding-3-small"
        )
        vector = emb_resp.data[0].embedding

        # 3. Search Pinecone
        print("🔍 Searching Vector DB...")
        search_resp = index.query(
            vector=vector,
            top_k=3,
            include_metadata=True
        )

        # 4. Build Context
        context = ""
        for match in search_resp.matches:
            if match.metadata and "text" in match.metadata:
                context += match.metadata["text"] + "\n\n"
        
        if not context:
            context = "No specific info found in documents."

        # 5. Generate Answer
        print("🤖 Generating Answer...")
        completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": f"Answer based on this:\n{context}"},
                {"role": "user", "content": request.message}
            ],
            model="gpt-3.5-turbo",
        )

        return {"response": completion.choices[0].message.content}

    except Exception as e:
        # This forces the "Silent Error" to show up in logs
        print("--- 🔥 CRITICAL ERROR LOG 🔥 ---")
        print(traceback.format_exc())
        print("------------------------------")
        raise HTTPException(status_code=500, detail=f"Internal Error: {str(e)}")
