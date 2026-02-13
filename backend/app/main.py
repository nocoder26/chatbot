import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI()

# --- CORS SETTINGS (THE FIX) ---
# allow_origins=["*"] allows ALL websites to connect.
# This prevents the CORS error you are seeing.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONNECT ROUTER ---
# This connects the chat logic you just built
app.include_router(chat.router)

@app.get("/")
def root():
    return {"status": "Active", "message": "Fertility Bot is Online"}
