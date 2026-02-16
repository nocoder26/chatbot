# Scalability Plan — 10x Growth Assessment

> Izana AI Codebase | `working-base-version` baseline

---

## 1. Current State Summary

| Metric | Value |
|--------|-------|
| Backend source lines | ~936 (4 files) |
| Frontend source lines | ~2,015 (9 files) |
| Test lines | ~971 (5 files, 75 tests) |
| External services | 4 (Pinecone, OpenAI, Groq, Cohere) |
| Deployment targets | 2 (Railway backend, Vercel frontend) |
| Knowledge base | ~170 PDFs, ingested into Pinecone |

The codebase is small enough that it works as a near-monolith today. The scalability risks emerge at 10x: 10x users, 10x knowledge base, 10x features, 10x team size.

---

## 2. Monolithic Files to Split

### 2.1 `backend/app/routers/chat.py` (422 lines) — CRITICAL

This single file contains 7 distinct responsibilities:

| Lines | Responsibility | Proposed Module |
|-------|---------------|-----------------|
| 22-32 | Configuration constants | `app/config.py` |
| 35-43 | Language mapping | `app/services/languages.py` |
| 45-84 | AI client initialization | `app/services/ai_clients.py` |
| 87-106 | Pydantic request/response models | `app/schemas.py` |
| 109-155 | Utility functions (save_log, clean_citation, sanitize_input) | `app/utils.py` |
| 158-214 | Reranking + Translation services | `app/services/reranker.py` + `app/services/translator.py` (extend existing) |
| 221-422 | Chat + Feedback endpoints | `app/routers/chat.py` (slim, only endpoints) |

**Impact:** Splitting this file makes every function independently testable, importable, and replaceable. Currently, testing `sanitize_input` requires importing the entire chat module, which triggers Pinecone/OpenAI initialization.

### 2.2 `frontend/src/app/chat/page.tsx` (755 lines) — HIGH

This file contains the entire chat experience as one component:

| Section | Proposed Module |
|---------|----------------|
| `GeminiFadeText` component | `src/components/chat/AnimatedText.tsx` |
| `InlineStarRating` + feedback reason | `src/components/chat/FeedbackRating.tsx` |
| Message rendering logic | `src/components/chat/MessageBubble.tsx` |
| Topic shortcut grid | `src/components/chat/TopicGrid.tsx` |
| Blood work upload flow | `src/hooks/useBloodWorkUpload.ts` |
| Chat message state + send logic | `src/hooks/useChat.ts` |
| Constants (TOPICS, LANGUAGES, etc.) | `src/lib/constants.ts` |
| Main page composition | `src/app/chat/page.tsx` (slim, ~100 lines) |

### 2.3 `frontend/src/app/admin/page.tsx` (517 lines) — MEDIUM

| Section | Proposed Module |
|---------|----------------|
| `SimpleBarChart` | `src/components/admin/BarChart.tsx` |
| `PinEntry` | `src/components/admin/PinEntry.tsx` |
| `Dashboard` | `src/components/admin/Dashboard.tsx` |
| Stats fetching | `src/hooks/useAdminStats.ts` |

### 2.4 `backend/app/main.py` (146 lines) — MEDIUM

| Section | Proposed Module |
|---------|----------------|
| CORS configuration | `app/middleware/cors.py` |
| Rate limiter setup | `app/middleware/ratelimit.py` |
| Blood work endpoint | `app/routers/bloodwork.py` |
| App factory | `app/main.py` (slim, ~30 lines) |

---

## 3. Proposed Feature-Based Directory Structure

### Backend (after refactor)

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                      # App factory only (~30 lines)
│   ├── config.py                    # All env vars + constants
│   ├── schemas.py                   # Pydantic models
│   ├── utils.py                     # save_log, clean_citation
│   ├── middleware/
│   │   ├── __init__.py
│   │   ├── cors.py                  # CORS config
│   │   └── ratelimit.py            # slowapi setup
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── chat.py                  # /chat endpoint only
│   │   ├── bloodwork.py            # /analyze-bloodwork endpoint
│   │   ├── feedback.py             # /feedback endpoint
│   │   └── admin.py                # /admin/* endpoints
│   └── services/
│       ├── __init__.py
│       ├── ai_clients.py           # Pinecone, OpenAI, Groq, Cohere init
│       ├── rag_pipeline.py         # Embed → Search → Rerank → Draft → QC
│       ├── reranker.py             # Cohere reranking
│       ├── translator.py           # Groq + RunPod translation
│       ├── sanitizer.py            # Input sanitization
│       └── languages.py            # Language map + helpers
├── tests/
│   ├── conftest.py
│   ├── unit/                        # Pure function tests
│   │   ├── test_sanitizer.py
│   │   ├── test_utils.py
│   │   ├── test_reranker.py
│   │   └── test_languages.py
│   ├── integration/                 # Endpoint tests with mocks
│   │   ├── test_chat_endpoint.py
│   │   ├── test_bloodwork_endpoint.py
│   │   ├── test_feedback_endpoint.py
│   │   └── test_admin_endpoint.py
│   └── security/                    # Red Zone tests
│       ├── test_auth.py
│       ├── test_cors.py
│       └── test_injection.py
├── data/                            # PDF documents
├── ingest_local.py
├── requirements.txt
└── requirements-dev.txt
```

### Frontend (after refactor)

```
frontend/src/
├── app/
│   ├── page.tsx                     # Language selector (slim)
│   ├── layout.tsx                   # Root layout
│   ├── globals.css
│   ├── chat/
│   │   └── page.tsx                 # Chat page (composition only, ~100 lines)
│   └── admin/
│       ├── page.tsx                 # Admin page (composition only)
│       └── lab-reviews/
│           └── page.tsx
├── components/
│   ├── chat/
│   │   ├── AnimatedText.tsx
│   │   ├── FeedbackRating.tsx
│   │   ├── MessageBubble.tsx
│   │   └── TopicGrid.tsx
│   ├── admin/
│   │   ├── BarChart.tsx
│   │   ├── PinEntry.tsx
│   │   └── Dashboard.tsx
│   ├── BloodWorkConfirm.tsx
│   ├── FeedbackModal.tsx
│   └── StarRating.tsx
├── hooks/
│   ├── useChat.ts
│   ├── useBloodWorkUpload.ts
│   └── useAdminStats.ts
└── lib/
    ├── api.ts
    └── constants.ts
```

---

## 4. Testing Infrastructure for Scale

### 4.1 Test Sharding Strategy

| Shard | Contents | Runs When | Est. Time |
|-------|----------|-----------|-----------|
| **Shard 1: Unit** | Pure function tests (sanitizer, utils, reranker, languages) | Every push | <2s |
| **Shard 2: Integration** | Endpoint tests with mocked AI services | Every push | <5s |
| **Shard 3: Security** | Auth, CORS, injection, brute-force | Red Zone changes only | <3s |
| **Shard 4: Frontend Build** | TypeScript + ESLint + Next.js build | Every push | ~10s |
| **Shard 5: E2E** (future) | Playwright/Cypress full flow tests | Pre-release only | ~30s |

### 4.2 Parallelization

```
Pre-push hook
    ├── [parallel] Shard 1: pytest tests/unit/ 
    ├── [parallel] Shard 2: pytest tests/integration/
    ├── [parallel] Shard 4: next build + next lint
    └── [conditional] Shard 3: pytest tests/security/ (if Red Zone changed)
```

With `pytest-xdist`, backend shards can run in parallel on multiple cores. Frontend build is already parallelized by Next.js internally.

### 4.3 CI Pipeline (recommended)

```yaml
# Future GitHub Actions workflow
jobs:
  backend-unit:     { runs-on: ubuntu-latest, steps: pytest tests/unit/ }
  backend-integ:    { runs-on: ubuntu-latest, steps: pytest tests/integration/ }
  backend-security: { runs-on: ubuntu-latest, steps: pytest tests/security/, if: red-zone-changed }
  frontend-build:   { runs-on: ubuntu-latest, steps: npm ci && next build && next lint }
  gate:             { needs: [backend-unit, backend-integ, frontend-build] }
```

---

## 5. Database & State Scalability

| Current | 10x Problem | Recommendation |
|---------|------------|----------------|
| JSON files in `/tmp/` for logs | Lost on redeploy; no querying | Migrate to PostgreSQL or a managed service |
| SQLite referenced but unused | Dead code removed, but no real DB | Add PostgreSQL for session/feedback persistence |
| Pinecone single index | Index size grows with PDFs | Namespace per document category; add metadata filtering |
| No conversation memory | Each message is stateless | Add Redis or DB-backed conversation sessions |
| No user sessions | Can't track per-user analytics | Add session tokens (JWT or cookie-based) |

---

## 6. API Rate Scaling

| Current | 10x Problem | Recommendation |
|---------|------------|----------------|
| `slowapi` in-memory rate limiter | Resets on restart; no sharing across replicas | Move to Redis-backed rate limiter |
| Single-process Uvicorn | Can't handle concurrent load | Add `gunicorn` with multiple Uvicorn workers |
| No request queuing | LLM calls block threads | Add async task queue (Celery/ARQ) for heavy operations |
| 4 external API calls per chat | Latency compounds; costs scale linearly | Add response caching layer; batch similar queries |
