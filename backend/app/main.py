from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI()

# --- CORS SETTINGS (THE CRITICAL FIX) ---
# allow_origins=["*"] tells the server to accept requests from ANY website.
# This fixes the "blocked by CORS policy" error instantly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONNECT THE CHAT LOGIC ---
app.include_router(chat.router)

@app.get("/")
def root():
    return {"status": "Active", "message": "Fertility Bot is Online"}
