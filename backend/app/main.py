import os
import traceback
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat
from pinecone import Pinecone
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# --- CORS SETUP ---
origins = [
    "http://localhost:3000",
    "https://chatbot-chi-amber.vercel.app",
    "https://chatbot-three-rust.vercel.app"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONNECT ROUTERS ---
app.include_router(chat.router)

@app.get("/")
def root():
    return {"status": "Active", "message": "Fertility Bot Online"}

# --- DIAGNOSTICS ENDPOINT ---
@app.get("/diagnose")
def diagnose_system():
    results = {"status": "checking"}
    
    # 1. Check Keys
    results["keys"] = {
        "OPENAI_KEY_PRESENT": bool(os.getenv("OPENAI_API_KEY")),
        "PINECONE_KEY_PRESENT": bool(os.getenv("PINECONE_API_KEY")),
        "PINECONE_INDEX_NAME": os.getenv("PINECONE_INDEX_NAME"),
        "PINECONE_ENV": os.getenv("PINECONE_ENVIRONMENT")
    }

    # 2. Test Pinecone Connection
    try:
        pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        index_name = os.getenv("PINECONE_INDEX_NAME")
        if index_name:
            index = pc.Index(index_name)
            stats = index.describe_index_stats()
            results["pinecone_connection"] = "SUCCESS"
            results["index_stats"] = str(stats)
        else:
            results["pinecone_connection"] = "FAILED: No Index Name"
            
    except Exception as e:
        results["pinecone_connection"] = "FAILED"
        results["error"] = str(e)
        results["traceback"] = traceback.format_exc()

    return results
