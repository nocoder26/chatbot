# Izana AI - System Architecture & Audit Report

**Date:** February 16, 2026
**Branch:** `cursor/system-architecture-audit-f33b`
**Auditor:** Automated Code Audit

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Component Inventory](#component-inventory)
4. [Current Status Assessment](#current-status-assessment)
5. [Quality Audit](#quality-audit)
6. [Security Audit](#security-audit)
7. [Recommendations](#recommendations)

---

## 1. Executive Summary

**Izana AI** is a multilingual fertility/reproductive health chatbot that uses Retrieval-Augmented Generation (RAG) to answer medical questions. The system ingests ~170 medical PDF documents into a Pinecone vector database, retrieves relevant context for user queries, and generates responses using Groq-hosted LLMs. It includes a blood work PDF analysis feature and an admin analytics dashboard.

### Key Findings

| Category | Rating | Summary |
|----------|--------|---------|
| **Architecture** | Adequate | Clean separation of frontend/backend, but dual logging systems and dead code reduce clarity |
| **Code Quality** | Needs Improvement | Duplicate endpoints, unused modules, suppressed errors, no tests, TypeScript/ESLint bypassed |
| **Security** | Critical Issues | Hardcoded admin PIN, wide-open CORS, no authentication, no rate limiting, prompt injection risk |
| **Deployment** | Functional | Railway + Vercel setup works but has hardcoded placeholder URLs and no CI/CD pipeline |

---

## 2. System Architecture

### High-Level Architecture

```
┌─────────────────────┐         ┌─────────────────────┐         ┌─────────────────┐
│   Vercel (Frontend)  │  HTTP   │  Railway (Backend)   │  gRPC   │    Pinecone     │
│   Next.js 14 (App)   │────────▶│  FastAPI + Uvicorn   │────────▶│  Vector DB      │
│   React 18 + TW CSS  │         │  Python 3.11         │         │  (cosine sim)   │
└─────────────────────┘         └──────────┬───────────┘         └─────────────────┘
                                           │
                          ┌────────────────┼────────────────┐
                          │                │                │
                          ▼                ▼                ▼
                   ┌────────────┐   ┌────────────┐   ┌────────────┐
                   │   Groq     │   │   OpenAI   │   │   Cohere   │
                   │   LLaMA 3  │   │   Ada-002  │   │  (Rerank)  │
                   │   (LLM)    │   │ (Embedding)│   │  (Unused)  │
                   └────────────┘   └────────────┘   └────────────┘
```

### Data Flow - Chat Query

```
User Question
    │
    ▼
[Next.js Frontend] ── POST /chat ──▶ [FastAPI Backend]
                                          │
                                          ├─ 1. Generate embedding via OpenAI Ada-002
                                          ├─ 2. Query Pinecone (top_k=5, cosine similarity)
                                          ├─ 3. Draft response via Groq LLaMA 3.3 70B
                                          ├─ 4. QC/JSON formatting via Groq LLaMA 3.1 8B
                                          ├─ 5. Log gaps if score < 0.3
                                          └─ 6. Return response + citations + suggested questions
```

### Data Flow - Blood Work Analysis

```
User uploads PDF
    │
    ▼
[Next.js Frontend] ── POST /analyze-bloodwork ──▶ [FastAPI Backend]
                                                       │
                                                       ├─ 1. Extract text via PyPDF
                                                       ├─ 2. Send to Groq LLaMA 3.3 70B (JSON mode)
                                                       └─ 3. Return structured lab results as JSON
                                                              │
                                                              ▼
                                                   [BloodWorkConfirm Component]
                                                       │
                                                       ├─ User reviews/edits extracted values
                                                       ├─ Adds missing fertility markers
                                                       └─ Confirms → triggers /chat with clinical_data
```

### Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | Next.js (App Router) | 14.2.35 | SSR/CSR React framework |
| **Frontend** | React | 18.x | UI library |
| **Frontend** | Tailwind CSS | 3.4.x | Utility-first CSS |
| **Frontend** | Framer Motion | 12.34.x | Animations |
| **Frontend** | Lucide React | 0.563.x | Icon library |
| **Backend** | FastAPI | >=0.110.0 | Python web framework |
| **Backend** | Uvicorn | >=0.27.0 | ASGI server |
| **Backend** | SQLAlchemy | >=2.0.0 | ORM (partially used) |
| **AI/ML** | Groq (LLaMA 3.3 70B) | - | Primary LLM for responses |
| **AI/ML** | Groq (LLaMA 3.1 8B) | - | QC formatting + missing marker checks |
| **AI/ML** | OpenAI Ada-002 | - | Text embeddings (1536-dim) |
| **AI/ML** | Cohere | 5.6.1 | Initialized but **unused** |
| **Vector DB** | Pinecone | >=3.1.0 | Semantic search index |
| **Translation** | RunPod (serverless) | - | Multilingual translation service (defined but **unused in routes**) |
| **Database** | SQLite | - | Legacy logging (partially used) |
| **Deployment** | Railway (Nixpacks) | - | Backend hosting |
| **Deployment** | Vercel | - | Frontend hosting |

---

## 3. Component Inventory

### Backend Structure

```
backend/
├── app/
│   ├── __init__.py              # Empty
│   ├── main.py                  # FastAPI app, CORS, /analyze-bloodwork endpoint
│   ├── models.py                # SQLAlchemy models: ChatLog, Feedback
│   ├── database.py              # SQLite engine, session management
│   ├── routers/
│   │   ├── __init__.py          # Empty
│   │   ├── chat.py              # Main chat logic, RAG pipeline, feedback, admin/stats
│   │   ├── admin.py             # Admin stats (DUPLICATE), DB download
│   │   └── feedback.py          # SQLAlchemy-based feedback (UNUSED by frontend)
│   └── services/
│       ├── __init__.py          # Empty
│       └── translator.py        # RunPod translation service (UNUSED in routes)
├── data/                        # ~170 medical PDF documents
├── ingest_local.py              # PDF → Pinecone ingestion script
├── Dockerfile                   # Python 3.11-slim container
├── nixpacks.toml                # Railway build config
├── requirements.txt             # Python dependencies
├── .env.example                 # Environment variable template
├── .gitignore
└── .railwayignore
```

### Frontend Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout, Geist fonts, metadata
│   │   ├── page.tsx             # Landing page (language selection)
│   │   ├── globals.css          # Tailwind + custom scrollbar
│   │   ├── chat/
│   │   │   └── page.tsx         # Main chat interface
│   │   └── admin/
│   │       ├── page.tsx         # Admin dashboard (PIN-protected)
│   │       └── lab-reviews/
│   │           └── page.tsx     # Knowledge gaps sub-page (legacy)
│   ├── components/
│   │   ├── BloodWorkConfirm.tsx # Lab result review/edit UI
│   │   ├── FeedbackModal.tsx    # Feedback comment modal
│   │   └── StarRating.tsx       # 5-star rating widget
│   └── lib/
│       └── api.ts               # API client functions (partially used)
├── public/
│   └── logo.png                 # Brand logo
├── package.json                 # Node.js dependencies
├── next.config.mjs              # Next.js config (errors suppressed!)
├── tailwind.config.ts           # Tailwind configuration
├── tsconfig.json                # TypeScript configuration
├── vercel.json                  # Vercel rewrites + env
├── postcss.config.mjs           # PostCSS config
├── .eslintrc.json               # ESLint config
├── CNAME                        # Empty (custom domain placeholder)
└── .gitignore
```

### Knowledge Base

- **~170 PDF documents** in `backend/data/` covering fertility, IVF, IUI, PCOS, endometriosis, male infertility, genetic testing, hormonal health, and more
- Sources include ASRM, ESHRE, CFAS, FSANZ clinical guidelines and patient fact sheets
- Ingested into Pinecone via `ingest_local.py` (600-char chunks, 100-char overlap, OpenAI Ada-002 embeddings)

---

## 4. Current Status Assessment

### What Is Working

| Feature | Status | Notes |
|---------|--------|-------|
| Language selection landing page | Functional | 9 languages supported in UI |
| Chat interface with topic shortcuts | Functional | 6 preset topics |
| RAG-based medical Q&A | Functional | Pinecone + Groq pipeline |
| Blood work PDF upload & extraction | Partially Functional | Upload triggers prompt but `onChange` handler is empty |
| Lab result review/edit component | Built | `BloodWorkConfirm.tsx` is complete but integration is incomplete |
| Admin dashboard | Functional | PIN "1234", shows gaps/feedback/doc usage |
| Knowledge gap tracking | Functional | Logs queries with Pinecone score < 0.3 |
| Document usage tracking | Functional | Logs which PDFs get cited |
| Feedback collection | Functional | Rating + reason logged to JSON files |
| Semantic caching on 5-star feedback | Functional | Upserts to Pinecone "semantic-cache" namespace |
| Animated response rendering | Functional | Paragraph-by-paragraph fade-in |

### What Is Incomplete / Broken

| Feature | Status | Details |
|---------|--------|---------|
| **PDF file upload handler** | Broken | `frontend/src/app/chat/page.tsx` line 164: `onChange={(e) => {/* existing upload logic */}}` - handler is empty |
| **Translation service** | Dead Code | `RunPodTranslator` class exists but is never imported or called from any route |
| **SQLAlchemy feedback router** | Dead Code | `routers/feedback.py` is defined but never registered in `main.py` |
| **SQLAlchemy models/database** | Dead Code | `models.py` and `database.py` define ChatLog/Feedback tables but are only used by the dead `feedback.py` router |
| **`api.ts` utility** | Partially Dead | `sendMessage()` and `submitFeedback()` exist but `chat/page.tsx` uses raw `fetch()` directly |
| **Cohere client** | Dead Code | Initialized in `chat.py` but never called |
| **Lab reviews sub-page** | Stale | `admin/lab-reviews/page.tsx` calls `/admin/gaps` which doesn't exist (should be `/admin/stats`) |
| **Vercel rewrite URL** | Placeholder | `vercel.json` still has `your-railway-backend.up.railway.app` |
| **CNAME** | Empty | No custom domain configured |

---

## 5. Quality Audit

### Critical Quality Issues

#### Q1. Duplicate / Conflicting Endpoints
**Severity: High**

Two separate `GET /admin/stats` endpoints exist:
- `backend/app/routers/chat.py` line 189: Registered at root level (`/admin/stats`)
- `backend/app/routers/admin.py` line 13: Registered with prefix (`/admin/stats`)

Both are included via `main.py`. FastAPI will route to whichever matches first, making one endpoint silently unreachable. The `chat.py` version mounts at `/admin/stats` (no prefix), while `admin.py` mounts at `/admin/stats` (with `/admin` prefix). This means they actually resolve to different paths, but the frontend calls `/admin/stats` which is ambiguous.

Similarly, two `/feedback` endpoints exist:
- `chat.py` line 178: `POST /feedback` (JSON file-based)
- `feedback.py` line 25: `POST /feedback` (SQLAlchemy-based, but never registered)

#### Q2. TypeScript and ESLint Checks Bypassed
**Severity: High**

```javascript
// next.config.mjs
eslint: { ignoreDuringBuilds: true },
typescript: { ignoreBuildErrors: true },
```

This means the production build will succeed even with type errors and lint violations. The codebase uses `any` types extensively (e.g., `useState<any[]>([])` in chat page), which defeats TypeScript's purpose.

#### Q3. No Test Suite
**Severity: High**

Zero test files exist across the entire project. No unit tests, integration tests, or end-to-end tests. For a medical information system, this is particularly concerning.

#### Q4. Broad Error Suppression
**Severity: Medium**

Multiple instances of bare `except` or `except Exception: pass`:
- `chat.py` line 63: `save_log` silently ignores all errors
- `chat.py` line 72: `clean_citation` returns fallback on any error
- `chat.py` line 97: Missing marker check silently fails
- `chat.py` line 186: Semantic cache upsert silently fails
- `admin.py` lines 27, 37, 47: Log reading errors caught but only printed

#### Q5. Inconsistent State Management (Frontend)
**Severity: Medium**

- `chat/page.tsx` uses raw `fetch()` instead of the `api.ts` utility functions
- `FeedbackModal.tsx` and `StarRating.tsx` components are built but not integrated into the chat page
- `BloodWorkConfirm` is imported but the file upload onChange handler is empty
- Language is stored in `localStorage` as a code (e.g., "en") but sent to the backend as the code, while the backend expects the full language name for translation

#### Q6. Dead Code Accumulation
**Severity: Medium**

Approximately 30% of backend code is dead:
- `database.py` (43 lines) - not used in active flow
- `models.py` (36 lines) - not used in active flow  
- `feedback.py` (74 lines) - never registered
- `translator.py` (112 lines) - never called
- Cohere client initialization (2 lines in chat.py) - never used

#### Q7. Hardcoded Configuration
**Severity: Medium**

- Pinecone index name `"reproductive-health"` hardcoded in `ingest_local.py` but loaded from env in `chat.py`
- LLM model names hardcoded throughout (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`)
- Embedding model `text-embedding-ada-002` hardcoded
- File log paths hardcoded to `/tmp/` (duplicated between `chat.py` and `admin.py`)
- Score threshold `0.3` hardcoded for gap detection

#### Q8. No Input Validation on Chat
**Severity: Medium**

- No maximum length on `message` field in `ChatRequest`
- No sanitization of user input before passing to LLM prompts
- No rate limiting on any endpoint

#### Q9. Railway Port Mismatch
**Severity: Low**

`railway.json` hardcodes port 8000, but Railway provides a `$PORT` environment variable. The `DEPLOY.md` correctly notes `--port $PORT` but the actual config doesn't use it.

---

## 6. Security Audit

### CRITICAL Vulnerabilities

#### S1. Hardcoded Admin Credentials
**Severity: CRITICAL**
**Location:** `frontend/src/app/admin/page.tsx` line 8

```javascript
const ADMIN_PIN = "1234";
```

The admin PIN is hardcoded in client-side JavaScript. Anyone can:
1. View it in the browser's source/network tab
2. Simply set `localStorage.setItem("adminAuthenticated", "true")` to bypass the PIN entirely
3. Access all admin endpoints directly without any authentication

**Impact:** Complete admin dashboard bypass. All knowledge gaps, user feedback, and document usage data exposed.

#### S2. No Backend Authentication
**Severity: CRITICAL**
**Location:** All backend endpoints

No endpoint requires authentication. The following are publicly accessible:
- `POST /chat` - Free LLM usage (costs money per query)
- `POST /analyze-bloodwork` - Free PDF analysis
- `POST /feedback` - Can inject arbitrary feedback data
- `GET /admin/stats` - Exposes all analytics data
- `GET /admin/download_db` - Downloads the entire SQLite database

**Impact:** Anyone can abuse AI endpoints (cost amplification attack), inject false feedback, and download all logged data.

#### S3. Wide-Open CORS Policy
**Severity: HIGH**
**Location:** `backend/app/main.py` lines 18-24

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Combined with `allow_credentials=True` and `allow_origins=["*"]`, this is a dangerous configuration. While browsers block credentialed requests with `*` origins, the intent clearly shows no CORS policy design. Any website can make requests to this API.

**Impact:** Cross-site request forgery potential; any malicious website can call the API on behalf of users.

#### S4. Prompt Injection Vulnerability
**Severity: HIGH**
**Location:** `backend/app/routers/chat.py` lines 122-124, `backend/app/main.py` lines 61-76

User input is directly interpolated into LLM prompts without sanitization:

```python
system_prompt = f"""You are Izana AI, a medical information assistant.
{promo} Always provide detailed medical context.
CONTEXT: {context_text} {missing_params_text}"""
```

And in the blood work analysis:
```python
prompt = f"""...
RAW TEXT FROM REPORT:
{extracted_text}
...
"""
```

**Impact:** Attackers can craft inputs that override system prompts, extract system instructions, or make the LLM produce harmful/misleading medical information.

#### S5. No Rate Limiting
**Severity: HIGH**
**Location:** All endpoints

No rate limiting on any endpoint. Each `/chat` request triggers:
- 1 OpenAI embedding API call
- 1 Pinecone query
- 2 Groq LLM calls (draft + QC)

**Impact:** Cost amplification attack. A simple script could make thousands of requests, incurring significant API costs.

#### S6. Sensitive Data in Logs on Disk
**Severity: MEDIUM**
**Location:** `backend/app/routers/chat.py` lines 18-19

```python
GAP_LOG_FILE = "/tmp/gap_logs.json"
FEEDBACK_LOG_FILE = "/tmp/feedback_logs.json"
```

User questions (which may contain personal health information) are logged to unencrypted JSON files in `/tmp/`. On shared hosting, `/tmp/` may be accessible to other processes.

**Impact:** Personal health information (PHI) exposure. Potential HIPAA/GDPR compliance violation depending on jurisdiction.

#### S7. Unrestricted File Upload
**Severity: MEDIUM**
**Location:** `backend/app/main.py` lines 37-95

The `/analyze-bloodwork` endpoint:
- Only validates file extension (easily spoofed)
- No file size limit
- Reads entire file into memory (`await file.read()`)
- Sends extracted text directly to LLM without size truncation

**Impact:** Memory exhaustion via large file upload; potential DoS. Extracted text from maliciously crafted PDFs could be used for prompt injection.

#### S8. Database File Download Without Auth
**Severity: MEDIUM**
**Location:** `backend/app/routers/admin.py` lines 56-75

`GET /admin/download_db` serves the SQLite database file to anyone. No authentication check.

**Impact:** Full database contents exposed to any requester.

#### S9. Client-Side Only Language/State
**Severity: LOW**
**Location:** `frontend/src/app/page.tsx`, `frontend/src/app/chat/page.tsx`

All state (language preference, interaction count, messages) is stored only in client-side memory or localStorage. No session management exists.

**Impact:** No audit trail per-user; cannot attribute actions to sessions.

#### S10. Missing COHERE_API_KEY in .env.example
**Severity: LOW**
**Location:** `backend/.env.example`

The Cohere API key is used in `chat.py` but not listed in `.env.example`, and the Pinecone index name is also not in the env template.

---

## 7. Recommendations

### Immediate (P0 - Do Now)

| # | Action | Effort |
|---|--------|--------|
| 1 | **Remove hardcoded admin PIN.** Implement proper backend authentication (JWT/session tokens) for admin endpoints. At minimum, move PIN to an environment variable. | Medium |
| 2 | **Add authentication middleware** to all `/admin/*` endpoints on the backend side. | Medium |
| 3 | **Restrict CORS origins** to your actual Vercel domain(s) instead of `"*"`. | Low |
| 4 | **Add rate limiting** (e.g., `slowapi` for FastAPI) on `/chat`, `/analyze-bloodwork`, and `/feedback`. | Low |
| 5 | **Fix the PDF upload handler** in `chat/page.tsx` - the `onChange` is empty. | Low |
| 6 | **Add input length validation** - cap message length (e.g., 2000 chars) and file size (e.g., 10MB). | Low |

### Short-Term (P1 - This Sprint)

| # | Action | Effort |
|---|--------|--------|
| 7 | **Remove dead code**: Unused `feedback.py`, `translator.py`, `models.py`, `database.py` (if truly unused), and Cohere initialization. Or complete their integration. | Low |
| 8 | **Resolve duplicate admin/stats endpoints** - consolidate into one router. | Low |
| 9 | **Add input sanitization** before LLM prompts to mitigate prompt injection. | Medium |
| 10 | **Enable TypeScript strict checks** and fix all type errors. Remove `ignoreDuringBuilds` flags. | Medium |
| 11 | **Add basic tests** - at minimum: endpoint smoke tests, RAG pipeline unit tests, PDF extraction tests. | Medium |
| 12 | **Use the `api.ts` utility consistently** across the frontend instead of raw `fetch()`. | Low |
| 13 | **Fix `vercel.json`** placeholder URL. | Low |
| 14 | **Fix `lab-reviews/page.tsx`** to use the correct API endpoint. | Low |
| 15 | **Use `$PORT` env variable** in `railway.json` start command. | Low |

### Medium-Term (P2 - Next Month)

| # | Action | Effort |
|---|--------|--------|
| 16 | **Implement proper session management** (user sessions, conversation history). | High |
| 17 | **Add structured logging** (replace JSON file logging with a proper logging framework). | Medium |
| 18 | **Add CI/CD pipeline** with linting, type-checking, and tests on PRs. | Medium |
| 19 | **Encrypt sensitive logs** or use a compliant logging service for PHI data. | Medium |
| 20 | **Add health check endpoint** for Railway monitoring. | Low |
| 21 | **Externalize all configuration** (model names, thresholds, etc.) to environment variables. | Medium |
| 22 | **Add error boundaries** in React for graceful failure handling. | Low |
| 23 | **Implement the translation service** end-to-end or remove RunPod dependency. | Medium |
| 24 | **Add medical disclaimer** prominently in the UI (legal requirement for health AI). | Low |

### Long-Term (P3 - Quarterly)

| # | Action | Effort |
|---|--------|--------|
| 25 | **HIPAA/GDPR compliance review** if handling real patient data. | High |
| 26 | **Implement conversation memory** (multi-turn context). Currently each message is independent. | High |
| 27 | **Add observability** (OpenTelemetry, structured traces for RAG pipeline). | High |
| 28 | **Migrate from SQLite** to PostgreSQL for production workloads. | Medium |
| 29 | **Implement Cohere reranking** (already initialized) to improve retrieval quality. | Medium |
| 30 | **Add automated knowledge base refresh pipeline** instead of manual `ingest_local.py`. | High |

---

## Appendix A: API Endpoint Map

| Method | Path | Router | Auth | Description |
|--------|------|--------|------|-------------|
| GET | `/` | main.py | None | Health check |
| POST | `/chat` | chat.py | None | Main RAG chat endpoint |
| POST | `/analyze-bloodwork` | main.py | None | PDF blood work extraction |
| POST | `/feedback` | chat.py | None | Submit feedback (JSON file) |
| GET | `/admin/stats` | chat.py | None | Get analytics (from chat router) |
| GET | `/admin/stats` | admin.py | None | Get analytics (from admin router, `/admin` prefix) |
| GET | `/admin/download_db` | admin.py | None | Download SQLite database |

**Note:** There is ambiguity between the two `/admin/stats` endpoints. The chat.py one registers at path `/admin/stats` without a prefix, while admin.py registers at path `/stats` with prefix `/admin`, resulting in the same effective path. FastAPI will use the first registered route.

## Appendix B: External Service Dependencies

| Service | Purpose | Failure Impact | Fallback |
|---------|---------|---------------|----------|
| **Pinecone** | Vector search | Chat completely fails | None (500 error) |
| **OpenAI** | Embeddings | Chat completely fails | None (500 error) |
| **Groq** | LLM responses | Chat completely fails | Generic error message |
| **Cohere** | Reranking | None (unused) | N/A |
| **RunPod** | Translation | None (unused) | N/A |

## Appendix C: Environment Variables Required

| Variable | Used In | Required | In .env.example |
|----------|---------|----------|-----------------|
| `GROQ_API_KEY` | main.py, chat.py | Yes | Yes |
| `PINECONE_API_KEY` | chat.py | Yes | Yes |
| `PINECONE_INDEX_NAME` | chat.py | Yes | **No** |
| `OPENAI_API_KEY` | chat.py, ingest_local.py | Yes | Yes |
| `COHERE_API_KEY` | chat.py | No (unused) | **No** |
| `RUNPOD_API_KEY` | translator.py | No (unused) | Yes |
| `RUNPOD_ENDPOINT_ID` | translator.py | No (unused) | Yes |
| `RAILWAY_ENVIRONMENT` | database.py, admin.py | Auto-set by Railway | N/A |
| `NEXT_PUBLIC_API_URL` | Frontend (multiple) | Yes | In vercel.json |

---

*End of Audit Report*
