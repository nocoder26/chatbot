import os
import traceback
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pinecone import Pinecone
from openai import OpenAI
from groq import Groq

router = APIRouter()

try:
    # 1. Pinecone & OpenAI (for embeddings/searching only)
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index = pc.Index(os.getenv("PINECONE_INDEX_NAME"))
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    # 2. Groq (The Open Source LLM Brain)
    # Using Llama-3-8b-8192 or Llama-3-70b-8192
    groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    
    print("✅ STARTUP SUCCESS: Open Source Llama-3 Loaded via Groq")

except Exception as e:
    print(f"❌ STARTUP FAILED: {str(e)}")
    pc, index, openai_client, groq_client = None, None, None, None

class ChatRequest(BaseModel):
    message: str

@router.post("/chat")
async def chat_endpoint(request: ChatRequest):
    if not groq_client or not index:
        raise HTTPException(status_code=500, detail="AI tools not initialized.")

    try:
        # Step A: Convert user message to a vector (OpenAI embedding)
        emb_resp = openai_client.embeddings.create(
            input=request.message,
            model="text-embedding-3-small"
        )
        vector = emb_resp.data[0].embedding

        # Step B: Search your Knowledge Base (Pinecone)
        search_resp = index.query(vector=vector, top_k=3, include_metadata=True)
        context = ""
        for match in search_resp.matches:
            if match.metadata and "text" in match.metadata:
                context += match.metadata["text"] + "\n\n"

        # Step C: Use Open Source Llama-3 to generate the answer
        completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": f"You are an open-source medical assistant. Use this context to answer:\n{context}"},
                {"role": "user", "content": request.message}
            ],
            model="llama3-8b-8192", # This is the Open Source model
        )

        return {"response": completion.choices[0].message.content}

    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
