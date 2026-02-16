# Architecture Zones - Risk & Velocity Classification

> Izana AI Codebase | `working-base-version` baseline

---

## Zone Map Overview

```
                            ┌─────────────────────────────┐
                            │        RED ZONE              │
                            │   Auth · Admin · CORS · Keys │
                            │   PIN verify · API key gen   │
                            │   Input sanitization         │
                            └──────────────┬──────────────┘
                                           │
                   ┌───────────────────────┼───────────────────────┐
                   │                                               │
          ┌────────▼────────┐                             ┌────────▼────────┐
          │   YELLOW ZONE    │                             │   YELLOW ZONE    │
          │  RAG Pipeline    │                             │  API Layer       │
          │  Reranker        │                             │  Blood Work      │
          │  Translation     │                             │  Feedback        │
          │  Log System      │                             │  Admin Stats     │
          └────────┬─────────┘                             └────────┬────────┘
                   │                                               │
    ┌──────────────┼───────────────────────────────────────────────┼──────────┐
    │                              GREEN ZONE                                 │
    │   Landing Page · Chat UI · Admin Dashboard UI · Components · CSS        │
    │   BloodWorkConfirm · StarRating · FeedbackModal · Layout · Fonts        │
    └─────────────────────────────────────────────────────────────────────────┘
```

---

## RED ZONE — Critical / High Risk

> **Policy:** Human-in-the-loop mandatory for every change. Heavy integration testing, security auditing required.

| File | Lines | Responsibility | Why Red |
|------|-------|---------------|---------|
| `backend/app/routers/admin.py` | 95 | PIN verification, API key generation, admin auth dependency, DB download | Controls all admin access; auto-generates crypto keys from PIN hash |
| `backend/app/main.py` lines 30-48 | ~20 | CORS configuration, origin regex, middleware | Misconfiguration exposes entire API to cross-origin attacks |
| `backend/app/routers/chat.py` lines 142-155 | ~15 | `sanitize_input()` — prompt injection defense | Only layer between user input and LLM system prompts |
| `backend/app/routers/chat.py` lines 45-84 | ~40 | AI client initialization (Pinecone, OpenAI, Groq, Cohere) | Credentials management; failures cascade to entire chat system |
| `backend/app/main.py` lines 54-60 | ~7 | Groq client init for blood work | Controls medical data processing capability |
| `backend/.env.example` | 28 | Secrets template | Defines security posture for all deployments |

### Red Zone Test Requirements
- Integration tests with mocked + real credential patterns
- PIN brute-force resistance validation
- CORS preflight tests for allowed/blocked origins
- Sanitization tests for every known prompt injection pattern
- API key generation determinism and collision tests
- Auth bypass attempt tests (missing headers, empty keys, malformed tokens)

---

## YELLOW ZONE — Medium Risk / Business Logic

> **Policy:** AI edits require review. 100% branch coverage, strict typing, integration tests with mocks.

| File | Lines | Responsibility | Why Yellow |
|------|-------|---------------|-----------|
| `backend/app/routers/chat.py` lines 221-387 | ~167 | `chat_endpoint()` — full RAG pipeline: embed → search → rerank → draft → QC → translate | Core product logic; 5 external API calls in sequence |
| `backend/app/routers/chat.py` lines 158-187 | ~30 | `rerank_results()` — Cohere reranking | Affects answer relevance quality |
| `backend/app/routers/chat.py` lines 190-214 | ~25 | `translate_with_groq()` — multi-language translation | Affects all non-English users |
| `backend/app/routers/chat.py` lines 390-422 | ~33 | `submit_feedback()` — feedback + semantic cache upsert | Writes to Pinecone; bad data corrupts future retrieval |
| `backend/app/routers/chat.py` lines 109-125 | ~17 | `save_log()` — JSON file logging with rotation | Data persistence for admin dashboard |
| `backend/app/routers/chat.py` lines 128-139 | ~12 | `clean_citation()` — source formatting | Affects citation accuracy shown to users |
| `backend/app/routers/chat.py` lines 87-106 | ~20 | Pydantic models: `ChatRequest`, `FeedbackRequest`, `ChatResponse` | API contract; breaking changes affect all clients |
| `backend/app/main.py` lines 73-146 | ~74 | `analyze_bloodwork()` — PDF extraction + LLM parsing | Processes medical documents; accuracy is critical |
| `backend/app/services/translator.py` | 100 | `RunPodTranslator` class + language maps | Translation fallback service |
| `backend/ingest_local.py` | 174 | PDF → Pinecone ingestion pipeline | Affects entire knowledge base quality |
| `frontend/src/lib/api.ts` | 135 | All API client functions | Single point of failure for frontend-backend communication |

### Yellow Zone Test Requirements
- Unit tests for every function with mock dependencies
- Branch coverage for all conditional paths (blood work vs. regular chat, English vs. translation, reranker on vs. off)
- Integration tests: full chat request → response cycle with mocked AI services
- Pydantic model validation edge cases (empty strings, boundary values, type coercion)
- Error path testing (API timeouts, malformed LLM responses, Pinecone failures)

---

## GREEN ZONE — High Velocity / Low Risk

> **Policy:** AI can edit freely. Tests: snapshot/render tests, lint compliance.

| File | Lines | Responsibility | Why Green |
|------|-------|---------------|----------|
| `frontend/src/app/page.tsx` | 88 | Language selection landing page | Static UI, no logic beyond localStorage write |
| `frontend/src/app/layout.tsx` | 35 | Root layout, fonts, metadata | Framework boilerplate |
| `frontend/src/app/globals.css` | 46 | Tailwind + custom scrollbar CSS | Styling only |
| `frontend/src/app/chat/page.tsx` | 755 | Chat interface UI | Complex but purely presentational state management |
| `frontend/src/app/admin/page.tsx` | 517 | Admin dashboard UI | Display-only; data fetched from Yellow Zone |
| `frontend/src/app/admin/lab-reviews/page.tsx` | 113 | Knowledge gaps sub-page | Display-only table |
| `frontend/src/components/BloodWorkConfirm.tsx` | 224 | Lab result review/edit modal | Local state manipulation only |
| `frontend/src/components/FeedbackModal.tsx` | 105 | Feedback comment modal | UI component, no external calls |
| `frontend/src/components/StarRating.tsx` | 43 | Star rating widget | Pure presentational component |
| `frontend/tailwind.config.ts` | 19 | Tailwind configuration | Config file |
| `frontend/next.config.mjs` | 3 | Next.js configuration | Config file |
| `frontend/postcss.config.mjs` | 8 | PostCSS configuration | Config file |
| `frontend/tsconfig.json` | 26 | TypeScript configuration | Config file |
| `frontend/.eslintrc.json` | 3 | ESLint configuration | Config file |
| `frontend/vercel.json` | 11 | Vercel rewrites + env | Deployment config (but affects routing — borderline Yellow) |

### Green Zone Test Requirements
- TypeScript compilation (already enforced)
- ESLint pass (already enforced)
- Component render smoke tests (proposed)
- Snapshot tests for key UI states (proposed)

---

## Zone Boundary Rules

1. **Any file touching `os.getenv()` for secrets** → Red Zone minimum
2. **Any file making external API calls** → Yellow Zone minimum
3. **Any file that only renders JSX/TSX with local state** → Green Zone
4. **Config files** → Green Zone unless they control security (CORS, auth)
5. **When in doubt, classify UP** (Green → Yellow, Yellow → Red)
