from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI()

# --- CORS SETUP (Allows Vercel to talk to Railway) ---
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

# --- CONNECT THE CHAT ROUTER ---
# This line is crucial. It tells the app to use the file you just edited.
app.include_router(chat.router)

@app.get("/")
def root():
    return {"status": "Active", "message": "Fertility Bot Backend is Running"}
