from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat, admin  # Make sure to import routers if you split them, or just chat
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI()

# --- CORS SETTINGS (THE CRITICAL FIX) ---
# allow_origins=["*"] allows ALL websites (including Vercel) to connect.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONNECT ROUTERS ---
app.include_router(chat.router)
# If you created a separate admin.py router, include it here. 
# If admin logic is in chat.py, you don't need the line below.
# app.include_router(admin.router) 

@app.get("/")
def root():
    return {"status": "Active", "message": "Fertility Bot is Online"}
