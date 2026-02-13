from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.database import engine, Base
from app.routers import chat, feedback, admin
from app import models

# Load environment variables
load_dotenv()

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Reproductive Health Chatbot API",
    description="API for reproductive health information chatbot",
    version="1.0.0"
)

# Configure CORS
origins = [
    "https://chatbot-chi-amber.vercel.app",
    "https://chatbot-three-rust.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://chatbot-.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chat.router)
app.include_router(feedback.router)
app.include_router(admin.router)


@app.get("/")
async def root():
    return {"message": "Reproductive Health Chatbot API"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
