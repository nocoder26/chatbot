# Izana AI — Architecture & Application Report

**Prepared as:** Principal Software Architect, Lead Developer, Technical Product Manager  
**Scope:** Holistic, end-to-end breakdown of the application based on codebase analysis.

---

## 1. Executive Summary & Architecture Overview

### Primary Purpose

**Izana AI** is a **reproductive-health companion chatbot** that provides anonymous, privacy-first fertility and reproductive health guidance. From the code:

- **Chat:** Users ask questions in natural language; the system enforces a **topic filter** (reproductive health only), uses **RAG** (5 question variants → Pinecone KB search → LLM ranking) for evidence-based answers, and returns responses in the user’s selected language with citations and follow-up questions.
- **Bloodwork:** Users upload PDF lab reports; the backend extracts text, uses an LLM to parse **all** markers, explains each marker’s relevance to fertility/reproductive health, and stores results per user with optional encryption.
- **Privacy & consent:** Registration is **anonymous** (username + avatar; optional passphrase or passkey). All data-collecting operations require **valid consent** (health data + model training); consent can be withdrawn. Tiered GDPR handling: Tier 1 (identifiable), Tier 2 (anonymized training data with k-anonymity and expiry), Tier 3 (aggregated analytics), plus audit logging and deletion/restriction flows.
- **Admin:** PIN-protected dashboard for knowledge gaps (chat vs bloodwork), user feedback, KB source usage (frequency + keywords), user analytics, and pending KB improvements (approve/dismiss gaps).

So the application’s purpose is: **private, consent-based fertility/reproductive health chat and bloodwork analysis, with RAG, topic scoping, and admin tooling for quality and compliance.**

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16 (App Router), React 18, TypeScript, Tailwind CSS, Framer Motion, Lucide React, SimpleWebAuthn (browser) |
| **Backend** | Node.js (ESM), Express 4.x, Prisma 6, JWT (jsonwebtoken), bcryptjs, Helmet, express-rate-limit, Multer, pdf-parse, node-cron |
| **LLM / AI** | OpenAI-compatible API (Groq SDK / `openai` package), model e.g. `llama-3.3-70b-versatile`; Xenova/transformers (BGE embedding) |
| **Vector DB** | Pinecone (`@pinecone-database/pinecone`) — userdata, knowledge base, bloodwork indices |
| **Database** | PostgreSQL (via Prisma) |
| **Auth** | JWT (Bearer), WebAuthn/Passkey (@simplewebauthn/server + browser), optional passphrase (bcrypt) |
| **DevOps / QA** | Vitest (backend + frontend), Playwright (e2e), Husky (prepare), bash quality-gate script (`scripts/smart-test.sh`), Vercel (frontend deployment implied by `NEXT_PUBLIC_API_URL` and vercel.app CORS) |

### Design Patterns

- **Modular monolith:** Single backend app with clear route modules (auth, register, passkey, consent, chat, bloodwork, profile, admin, push, userRights) and shared libs (llm, pinecone, topicFilter, ragMultiQuery, promptRouter, gdpr/*).
- **Layered backend:** Routes → middleware (verifyJWT, requireConsent, verifyAdmin) → services/libs → Prisma/Pinecone.
- **RAG pipeline:** Multi-query expansion (5 variants) → vector search per variant → merge/dedupe → LLM rank → confidence score → answer with optional KB context; below-threshold answers still returned but logged as knowledge gaps.
- **Consent gate:** `requireConsent` middleware on chat and bloodwork ensures only consented users can use data-collecting features.
- **Event-style logging:** UserActivity (topic_classification, chat_message, feedback, knowledge_gap, session_end, etc.) and AuditLog for compliance and analytics.
- **Cron-driven background jobs:** Tier-2 extraction, privacy deletion, Tier-3 aggregation, model-improvement (knowledge-gap) cron.
- **Strategy-style routing:** Topic filter (keyword fast-path off-topic only; on-topic always via LLM); prompt router adjusts by category (e.g. bloodwork vs general) from TrainingFeedback.

---

## 2. Repository & Branch Structure Analysis

### Directory Breakdown

```
chatbot/
├── backend-node/           # Express API and workers
│   ├── prisma/
│   │   └── schema.prisma   # PostgreSQL schema (User, Chat, Message, Consent, etc.)
│   ├── src/
│   │   ├── index.js       # App entry, CORS, rate limits, route mounting, feedback route, crons
│   │   ├── routes/        # auth, register, passkey, consent, chat, bloodwork, profile, admin, push, userRights
│   │   ├── middleware/    # auth.js (verifyJWT)
│   │   ├── lib/           # prisma, llm, pinecone, topicFilter, ragMultiQuery, promptRouter, usernames
│   │   ├── gdpr/          # encryption, consentCheck, auditLogger, anonymization, sanitizer, riskAssessment, modelImprovement
│   │   └── cron/          # tier2Extraction, privacyDeletion, tier3Aggregation, modelImprovement
│   └── __tests__/         # Vitest unit/integration tests
├── frontend/               # Next.js App Router app
│   └── src/
│       ├── app/
│       │   ├── page.tsx    # Landing: language → consent → profile → security → /chat or login
│       │   ├── layout.tsx, globals.css
│       │   ├── chat/page.tsx
│       │   ├── admin/page.tsx (and admin/lab-reviews)
│       │   └── profile/page.tsx
│       └── lib/
│           └── api.ts     # resolveApiUrl, all API calls and types
├── e2e/                    # Playwright specs (registration, login, consent, chat topic filter, admin, etc.)
├── scripts/
│   └── smart-test.sh      # Quality gate: red/yellow/green zones, test + lint + optional e2e
├── .husky/                 # Git hooks (prepare)
├── package.json            # Root scripts: test, test:e2e, test:e2e:full, quality-gate
└── playwright.config.ts    # E2E: chromium, webServer for backend 8080 + frontend 3000
```

Config lives in: env (`.env`), `backend-node/package.json`, `frontend/package.json`, `playwright.config.ts`, and `scripts/smart-test.sh`. No `.github` workflows were found in the repo; CI/CD is inferred from quality-gate script and Vercel.

### Branching Strategy

From `git branch -a`:

- **main** — primary long-lived branch (remotes/origin/HEAD → origin/main).
- **staging** — likely pre-production.
- **feature/blood-work-beta** — feature branch for bloodwork.
- **sandbox-auth-push**, **sandbox/auth-and-chat** — sandbox/experimental.
- **cursor/system-architecture-audit-f33b** — audit/analysis branch.

**Inferred CI/CD:** Quality gate (`npm run quality-gate`) is change-set driven: red zone (auth, GDPR, cron, index, pinecone) → full tests + security audit + optional e2e; yellow zone (routes, libs, key frontend pages) → backend + frontend tests + lint; green → lint only. E2E can be run explicitly (`npm run test:e2e` or `test:e2e:full` with repeat). Deployment is likely: main/staging → Vercel (frontend) and a Node host for backend (e.g. Railway/Render), with env-based `NEXT_PUBLIC_API_URL` and CORS allowing `*.vercel.app`.

---

## 3. Core Features & Data Flow

### Key Features

1. **Anonymous registration & auth** — Username + avatar; optional passphrase or passkey; JWT for API access.
2. **Consent lifecycle** — Grant (health + model training), status check, withdraw; versioned consent; enforced on chat and bloodwork.
3. **Reproductive-health chat** — Topic filter (off-topic → scope message + 3 suggestions); RAG (5 variants, Pinecone, LLM rank, match score); streaming or JSON response; follow-up questions; citations; knowledge-gap logging when below threshold.
4. **Bloodwork analysis** — PDF upload → text extraction → LLM parses all markers → per-marker description + fertility relevance; summary, fertility_note, suggested_questions; stored per user; optional encryption; KB lookup and gap logging per marker.
5. **User profile** — Profile fetch (user, chats, bloodwork); navigation to chat/profile; logout.
6. **Feedback** — Session-end beacon and explicit feedback (rating/reason) to `/api/feedback`; chat message rating via `/api/chat/rate`; both can write UserActivity and TrainingFeedback.
7. **Admin dashboard** — PIN (ADMIN_PIN / x-admin-key); stats (gaps, gapsChat, gapsBloodwork, feedback, doc_usage, kb_sources); user-analytics (24h); users list; user drill-down; knowledge-gaps and pending-improvements; approve-gap (optional KB upsert) and dismiss.
8. **GDPR** — Consent, deletion requests, processing restriction; Tier-2 anonymization and expiry; Tier-3 aggregates; audit log; encryption at rest (optional).
9. **PWA / Push** — Push subscription routes and storage for notifications.

### Data Models (Primary Entities)

- **User** — id, username, usernameHash, passphraseHash, avatarUrl, createdAt. Relations: Chat, BloodWorkReport, WebAuthnCredential, UserActivity, Consent, PushSubscription.
- **Chat** — id, userId, title, createdAt. Relations: Message[].
- **Message** — id, chatId, role, content, encryptedData, encryptionMeta, createdAt.
- **BloodWorkReport** — id, userId, results (JSON), summary, encryptedData, encryptionMeta, createdAt.
- **UserActivity** — id, userId, type, metadata (JSON), createdAt. Used for topic_classification, chat_message, feedback, knowledge_gap, session_end, etc.
- **Consent** — id, userId, consentVersion, healthDataConsent, modelTrainingConsent, grantedAt, withdrawnAt.
- **WebAuthnCredential** — id, userId, credentialId, publicKey, counter, transports, createdAt.
- **DeletionRequest**, **ProcessingRestriction** — GDPR request and restriction state.
- **AnonymizedQAPair**, **AnonymizedBloodwork**, **TrainingFeedback** — Tier-2 with expiry; **AnalyticsAggregate** — Tier-3; **AuditLog** — integrityHash and details.
- **PushSubscription** — endpoint, p256dh, auth for PWA.

Relationships: User 1:N Chat, Message (via Chat), BloodWorkReport, UserActivity, Consent; Chat 1:N Message. Admin data is derived from UserActivity and Prisma aggregates, not separate admin tables.

### State Management / API Flow

- **Client state:** React component state and URL (e.g. `/chat?chatId=...`). No global store (Redux/Zustand) observed; token in `localStorage` (`izana_token`), admin key in `localStorage` (`izana_admin_key`).
- **API flow:** Frontend `lib/api.ts` uses `resolveApiUrl(path)` (env or localhost:8080) and `getAuthHeaders()` (Bearer token). Key flows:
  - **Onboarding:** `fetchRegisterOptions` → `registerAnonymous` or passkey flow → `grantConsent` → redirect to `/chat` or login.
  - **Chat:** `sendChatMessage` (or streaming fetch) with JWT → backend `verifyJWT` → `requireConsent` → topic filter → RAG (variants, search, rank) → LLM → store message + activity; optional knowledge_gap.
  - **Bloodwork:** `analyzeBloodWork(file, language)` with FormData + JWT → upload → parse → store.
  - **Feedback:** `submitFeedback` and `rateMessage` with auth headers so backend can attach userId.
  - **Admin:** All admin calls send `x-admin-key`; backend `verifyAdmin` compares to `ADMIN_PIN`.
- **Data flow:** User actions → API → Express route → middleware → Prisma/Pinecone/LLM → JSON or SSE → frontend updates local state/UI.

---

## 4. End-User Journeys (Client-Side)

### Journey 1: First-time onboarding → Chat

- **Steps:** Language selection → Privacy & Consent (checkbox + “I Agree”) → Create profile (username from options/shuffle, avatar) → Optional security (passphrase or “Skip”) → Redirect to `/chat`.
- **Components:** `frontend/src/app/page.tsx` (single multi-step page with steps for language, consent, profile, security; uses `fetchRegisterOptions`, `registerAnonymous`, `grantConsent`).
- **Routes:** `GET /api/register-options`, `POST /api/register-anonymous` (or passkey), `POST /api/consent`, then client-side `router.push('/chat')`.
- **Backend:** `register.js`, `consent.js`; auth via JWT from register or passkey.

### Journey 2: Returning user login → Chat

- **Steps:** “I already have an account” → Enter username → If passphrase: enter passphrase; if passkey: WebAuthn; then redirect to `/chat`.
- **Components:** Same `page.tsx` (login branch: `checkAuthMethods`, `loginWithPassphrase` or passkey).
- **Routes:** `POST /api/auth/...` (passphrase or passkey verify).
- **Backend:** `auth.js`, `passkey.js`.

### Journey 3: Core task — Chat (reproductive health Q&A)

- **Steps:** User types message → Send → Optional streaming; display AI response, citations, suggested questions; optional thumbs up/down and reason; navigate to profile or new chat.
- **Components:** `frontend/src/app/chat/page.tsx` (messages, input, language, feedback UI, profile/exit).
- **Routes:** `POST /api/chat` (JWT, body: message, chatId?, title?, stream?, language).
- **Backend:** `chat.js` — verifyJWT, requireConsent, topic filter, RAG (ragMultiQuery), LLM (stream or not), store Message + UserActivity; if off-topic return scope message + suggestions; if RAG below threshold log knowledge_gap.

### Journey 4: Bloodwork upload and results

- **Steps:** User uploads PDF (e.g. from profile or dedicated flow) → Backend parses and analyzes → Results shown (all markers, fertility relevance, summary, suggested questions).
- **Components:** Bloodwork flow likely in chat or profile context; `analyzeBloodWork` in `api.ts`.
- **Routes:** `POST /api/analyze-bloodwork` (multipart, JWT).
- **Backend:** `bloodwork.js` — verifyJWT, requireConsent, multer, pdf parse, LLM, Prisma BloodWorkReport, optional Pinecone/vectorize, per-marker KB/gap logging.

### Journey 5: Profile and settings

- **Steps:** Open profile → View user, chats, bloodwork; navigate to chat; optionally trigger deletion/restriction or consent withdrawal.
- **Components:** `frontend/src/app/profile/page.tsx`.
- **Routes:** Profile fetch (user + chats + bloodwork), GDPR endpoints under `/api/gdpr`, consent withdraw.
- **Backend:** `profile.js`, `userRights.js`, `consent.js`.

### Journey 6: Session end and feedback

- **Steps:** Before unload: `sendBeacon` to `/api/feedback` with session duration/message count; after AI message: optional rating and reason.
- **Components:** `chat/page.tsx` (beforeunload, handleRate, handleFeedbackReason).
- **Routes:** `POST /api/feedback`, `POST /api/chat/rate`.
- **Backend:** `index.js` (feedback route with optional JWT), `chat.js` (rate handler); both write UserActivity/TrainingFeedback.

---

## 5. Admin & Operational Flows (Server/Admin-Side)

### Administrative Workflows

1. **Access** — Enter PIN → `POST /api/admin/verify-pin` → store admin_key in localStorage → subsequent requests send `x-admin-key`.
2. **Stats** — `GET /api/admin/stats` → gaps (all + gapsChat + gapsBloodwork), feedback, doc_usage, kb_sources (document, frequency, keywords).
3. **User analytics** — `GET /api/admin/user-analytics` → 24h active users, conversations, bloodwork counts, recent activities, top question categories, bloodwork patterns, sentiment, session duration, device breakdown.
4. **Users list** — `GET /api/admin/users` → anonymized user list with engagement (message count, chats, bloodwork, ratings, thumbs up/down, last active, session duration).
5. **User drill-down** — `GET /api/admin/user-analytics/:userId` → that user’s activities, chats (with messages), bloodwork.
6. **Knowledge gaps** — `GET /api/admin/knowledge-gaps` (from model improvement) and `GET /api/admin/pending-improvements` (knowledge_gap activities not resolved).
7. **Approve/dismiss gap** — `POST /api/admin/approve-gap` with gapId, optional answer, action (approve | dismiss); approve can upsert to Pinecone; mark gap resolved in metadata.

### Permissions and Authentication

- **Admin:** Every admin route uses `verifyAdmin`: `x-admin-key` must equal `process.env.ADMIN_PIN` (default `2603`). No role table; single shared PIN.
- **User:** Chat, bloodwork, profile, consent, userRights use `verifyJWT` (Bearer JWT, `req.userId`). Chat and bloodwork also use `requireConsent` (valid, non-withdrawn, version-matched consent with healthDataConsent true).
- **Feedback:** `/api/feedback` and `/api/chat/rate` accept optional JWT; if present, feedback is associated with userId.

### Admin Routes Summary

| Method | Path | Handler | Auth |
|--------|------|---------|------|
| POST | /api/admin/verify-pin | verify-pin | body pin |
| GET | /api/admin/stats | stats | verifyAdmin |
| GET | /api/admin/user-analytics | user-analytics | verifyAdmin |
| GET | /api/admin/user-analytics/:userId | drill-down | verifyAdmin |
| GET | /api/admin/users | users | verifyAdmin |
| GET | /api/admin/knowledge-gaps | knowledge-gaps | verifyAdmin |
| GET | /api/admin/pending-improvements | pending-improvements | verifyAdmin |
| POST | /api/admin/approve-gap | approve-gap | verifyAdmin |

All in `backend-node/src/routes/admin.js`.

---

## 6. Technical Debt & Strategic Recommendations

### Security & Scalability

- **Admin PIN in env:** Single shared PIN is simple but weak; consider proper admin auth (e.g. JWT or OAuth) and per-operator audit.
- **Rate limits:** Chat and bloodwork: 100 req/15 min; GDPR: 10/15 min. Reasonable for small/medium scale; under heavy abuse or many tenants may need per-user or per-IP tuning and/or Redis-backed limits.
- **CORS:** Currently allows any origin (blocked origins still get `callback(null, true)`). Tighten to explicit allowlist in production.
- **JWT storage:** Token in localStorage is XSS-visible; consider httpOnly cookies for refresh and short-lived access token if threat model requires.
- **Secrets:** JWT_SECRET, ADMIN_PIN, GROQ/LLM keys must be in env and not committed; consider secret manager and rotation.
- **Pinecone/LLM:** RAG and topic filter add latency (multiple LLM calls + vector search); consider caching for repeated queries and async/queue for non-real-time steps if scaling.
- **DB connection pool:** Prisma default pool; under high concurrency tune and monitor.

### Missing Pieces & Quality

- **Tests:** Backend has Vitest (e.g. auth, consent, admin, chat, bloodwork, encryption, anonymization, crons). Frontend has Vitest for api, pages (admin, profile, onboarding). E2E (Playwright) covers registration, login, consent, chat topic filter, admin, language, cookie consent, UI. Gaps: no visible integration tests against a real DB; e2e don’t cover full RAG/bloodwork flows end-to-end; error-path and consent-withdrawn flows could be expanded.
- **Error handling:** Many routes use try/catch and 500 with generic message; consent and auth return structured errors (403 consent_required, 401). Missing: centralized error codes, user-facing message mapping, and optional error reporting (e.g. Sentry).
- **Documentation:** READMEs are minimal; no OpenAPI/Swagger for API; no architecture diagram in repo. Recommend: API spec, env var table, and one-page architecture diagram.
- **Logging:** Console.log/error used; no structured logger or log levels. Recommend: structured JSON logs and level (info/warn/error) for production.
- **Validation:** Request bodies validated ad hoc (e.g. consent booleans, message string). Recommend: schema validation (e.g. Zod/Joi) on all inputs.
- **Idempotency:** No idempotency keys on feedback or chat; duplicate submissions can create duplicate activities.

### Summary

The codebase is well-structured for a privacy-focused reproductive-health chatbot with RAG, topic filtering, bloodwork analysis, and GDPR-oriented consent and tiers. The main improvements to prioritize are: stronger admin auth, tighter CORS and security hardening, better error handling and validation, structured logging, and expanded tests (especially integration and e2e for RAG and bloodwork). Filling documentation (API spec, architecture diagram, env table) will help onboarding and operations.
