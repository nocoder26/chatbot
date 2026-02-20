# Deployment Guide

## Backend Deployment (Railway)

### 1. Create Railway Project

1. Go to [Railway](https://railway.app) and create a new project
2. Connect your GitHub repository
3. Select the `backend` directory as the root

### 2. Configure Volume for SQLite Persistence

1. Go to **Settings** > **Volumes**
2. Click **Add Volume**
3. Set Mount Path: `/app/backend/data`
4. This ensures your SQLite database persists across deployments

### 3. Set Environment Variables

Add the following environment variables in Railway:

```
# Required API Keys
GROQ_API_KEY=your_groq_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_USERDATA_INDEX=userdata
PINECONE_KB_INDEX=reproductive-health
OPENAI_API_KEY=your_openai_api_key
COHERE_API_KEY=your_cohere_api_key

# Security (CHANGE THESE!)
ADMIN_PIN=your-secure-pin
ADMIN_API_KEY=your-secure-random-api-key
ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app

# Railway auto-sets these
RAILWAY_ENVIRONMENT=production
PORT=8000
```

### 4. Deploy

Railway will automatically deploy when you push to your main branch. The start command is configured in `railway.json`.

---

## Frontend Deployment (Vercel)

### 1. Create Vercel Project

1. Go to [Vercel](https://vercel.com) and create a new project
2. Connect your GitHub repository
3. Set the root directory to `frontend`

### 2. Configure Environment Variables

Add the following environment variable:

```
NEXT_PUBLIC_API_URL=https://your-railway-backend.up.railway.app
```

### 3. Update vercel.json

Edit `frontend/vercel.json` and replace the placeholder URL with your actual Railway backend URL.

### 4. Deploy

Vercel will automatically deploy when you push to your main branch.

---

## Knowledge Base Management

### Ingesting PDF Documents

To update the knowledge base with new PDF documents:

1. Place PDF files in `backend/data/` directory
2. Ensure you have a `.env` file with your API keys in the `backend/` directory
3. Run the ingestion script locally:

```bash
cd backend
python ingest_local.py
```

This will:
- Scan all PDFs in `backend/data/`
- Split them into chunks (600 chars, 100 overlap)
- Generate embeddings using OpenAI Ada-002
- Upsert to Pinecone index `reproductive-health`

### Notes

- The Pinecone index is shared between local and production environments
- Run ingestion locally to avoid long build times on Railway
- PDF files are tracked in git (see `.gitignore` negation pattern)

---

## Architecture Overview

```
┌─────────────────────┐         ┌─────────────────────┐         ┌─────────────────┐
│   Vercel (Frontend)  │  HTTP   │  Railway (Backend)   │         │    Pinecone     │
│   Next.js 14 (App)   │────────>│  FastAPI + Uvicorn   │────────>│  Vector DB      │
│   React 18 + TW CSS  │         │  Python 3.11         │         │  (cosine sim)   │
└─────────────────────┘         └──────────┬───────────┘         └─────────────────┘
                                           │
                          ┌────────────────┼────────────────┐
                          │                │                │
                          v                v                v
                   ┌────────────┐   ┌────────────┐   ┌────────────┐
                   │   Groq     │   │   OpenAI   │   │   Cohere   │
                   │   LLaMA 3  │   │   Ada-002  │   │  Reranker  │
                   │  (LLM +    │   │ (Embedding)│   │ (v3.5)     │
                   │ Translation)│   └────────────┘   └────────────┘
                   └────────────┘
```

### Supported Languages

English, Tamil, Hindi, Telugu, Malayalam, Spanish, Japanese

### Security Features

- Admin PIN verified server-side only
- Admin API key required for all admin endpoints (X-Admin-Key header)
- CORS restricted to configured origins (ALLOWED_ORIGINS env var)
- Rate limiting on upload endpoints (slowapi)
- Input sanitization against prompt injection
- File size limits on PDF uploads
- Pydantic validation on all request models

---

## Local Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
# Set NEXT_PUBLIC_API_URL=http://localhost:8000 in .env.local
npm run dev
```

---

## Troubleshooting

### Database not persisting on Railway
Ensure the volume is mounted at `/app/backend/data`. Check Railway logs for any mount errors.

### CORS errors
Verify that `ALLOWED_ORIGINS` includes your Vercel domain and `NEXT_PUBLIC_API_URL` matches your Railway backend URL exactly (including https://).

### Reranking not working
Ensure `COHERE_API_KEY` is set. The system will fall back to raw Pinecone scores if Cohere is unavailable.

### Translation not working
Translation uses Groq LLM. Ensure `GROQ_API_KEY` is set. If the user selects English, no translation occurs.

### Empty search results
Run `python backend/ingest_local.py` to populate the Pinecone index with your PDF documents.

### Admin login fails
Ensure `ADMIN_PIN` and `ADMIN_API_KEY` are set as environment variables on Railway.
