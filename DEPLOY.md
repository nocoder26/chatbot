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
GROQ_API_KEY=your_groq_api_key
PINECONE_API_KEY=your_pinecone_api_key
OPENAI_API_KEY=your_openai_api_key
RUNPOD_API_KEY=your_runpod_api_key
RUNPOD_ENDPOINT_ID=your_runpod_endpoint_id
RAILWAY_ENVIRONMENT=production
```

### 4. Configure Start Command

Set the start command in Railway:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### 5. Deploy

Railway will automatically deploy when you push to your main branch.

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

Edit `frontend/vercel.json` and replace `your-railway-backend.up.railway.app` with your actual Railway backend URL.

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
- Generate embeddings using OpenAI
- Upsert to Pinecone index `reproductive-health`

### Notes

- The Pinecone index is shared between local and production environments
- Run ingestion locally to avoid long build times on Railway
- PDF files are tracked in git (see `.gitignore` negation pattern)

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
npm run dev
```

---

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Vercel         │────▶│  Railway        │────▶│  Pinecone       │
│  (Next.js)      │     │  (FastAPI)      │     │  (Vector DB)    │
│                 │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                    ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │  Groq    │ │  RunPod  │ │  SQLite  │
              │  (LLM)   │ │ (Transl) │ │  (Logs)  │
              └──────────┘ └──────────┘ └──────────┘
```

---

## Troubleshooting

### Database not persisting on Railway

Ensure the volume is mounted at `/app/backend/data`. Check Railway logs for any mount errors.

### CORS errors

Verify that `NEXT_PUBLIC_API_URL` matches your Railway backend URL exactly (including https://).

### Translation errors

Check that `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` are set correctly. The translator will fallback gracefully on errors.

### Empty search results

Run `python backend/ingest_local.py` to populate the Pinecone index with your PDF documents.
