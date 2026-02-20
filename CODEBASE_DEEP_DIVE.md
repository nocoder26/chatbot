# Izana AI — Codebase Deep Dive: Structure, Data Flow, and UI/UX

This document provides a 100% understanding of the codebase structure, end-to-end data flow, and UI/UX so you can confidently modify parts that do not work well.

---

## 1. Repository Structure (Logical Grouping)

```
chatbot/
├── backend-node/
│   ├── prisma/schema.prisma     # Single source of truth for PostgreSQL models
│   ├── src/
│   │   ├── index.js             # Express app: CORS, rate limits, route mount, /api/feedback, crons
│   │   ├── routes/              # One file per domain (auth, register, passkey, consent, chat, bloodwork, profile, admin, push, userRights)
│   │   ├── middleware/auth.js   # verifyJWT only (sets req.userId)
│   │   ├── lib/                 # Shared logic: prisma, llm, pinecone, topicFilter, ragMultiQuery, promptRouter, usernames
│   │   ├── gdpr/                # consentCheck (requireConsent), encryption, auditLogger, anonymization, sanitizer, riskAssessment, modelImprovement
│   │   └── cron/                # tier2Extraction, privacyDeletion, tier3Aggregation, modelImprovement
│   └── __tests__/
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx         # Single-page onboarding (language → consent → registration → security OR login)
│       │   ├── layout.tsx       # Root layout
│       │   ├── chat/page.tsx    # Chat UI (messages, input, bloodwork upload, feedback, modals)
│       │   ├── profile/page.tsx # Dashboard: chats, bloodwork, GDPR actions
│       │   └── admin/           # Admin dashboard (page.tsx, lab-reviews)
│       ├── components/          # BloodWorkConfirm (modal for review/edit lab results before “analysis”)
│       └── lib/api.ts           # All API calls + types; resolveApiUrl, getAuthHeaders
├── e2e/                         # Playwright specs
├── scripts/smart-test.sh       # Quality gate (red/yellow/green)
└── package.json, playwright.config.ts
```

**Config and env:** Backend uses `dotenv`; critical vars: `DATABASE_URL`, `JWT_SECRET`, `GROQ_API_KEY` (or `LLM_API_KEY`), `ADMIN_PIN`, `PINECONE_*`, `CONSENT_VERSION`. Frontend uses `NEXT_PUBLIC_API_URL` (default `http://localhost:8080`) and `resolveApiUrl()` for all requests.

---

## 2. Backend Request Flow (Order of Execution)

For every request:

1. **Global middleware (index.js):** CORS, helmet, `express.json`, then route-specific rate limiters:
   - `/api/chat` and `/api/analyze-bloodwork`: 100 requests per 15 min
   - `/api/gdpr`: 10 per 15 min
2. **Route matching:** Passkey routes first (`/api/auth/passkey`), then auth, register, consent, gdpr, chat, bloodwork, profile, user-profile, admin, push. Feedback is on the main app: `POST /feedback` and `POST /api/feedback`.
3. **Per-route middleware:**
   - Chat: `verifyJWT` → `requireConsent` → handler
   - Bloodwork: `verifyJWT` → `requireConsent` → `upload.single('file')` → handler
   - Profile GET `/:username`: no auth (see Security note below)
   - Profile DELETE `/:username/chats/:chatId`: `verifyJWT` → handler
   - Admin: `verifyAdmin` (x-admin-key === ADMIN_PIN) on all admin routes

**Consent:** `requireConsent` (gdpr/consentCheck.js) loads the latest consent for `req.userId`; if missing, withdrawn, version mismatch, or `healthDataConsent` false, responds 403 `consent_required`. So chat and bloodwork are gated; profile and feedback are not.

---

## 3. Data Flow by Feature

### 3.1 Registration and Onboarding

- **Frontend (page.tsx):** Step order: `language` → `consent` → `registration` → `security` (or `login`). Consent is a single checkbox; state `consent` is used when continuing to registration and when calling `grantConsent` after register (both health and model training set from that one checkbox).
- **API calls:** `fetchRegisterOptions()` → GET `/api/register-options` (no auth). Then either:
  - **New user:** `registerAnonymous({ username, avatarUrl, passphrase? })` → POST `/api/register-anonymous` → returns `{ token, user }`; then `grantConsent({ healthDataConsent, modelTrainingConsent })` → POST `/api/consent` with Bearer token.
  - **Skip security:** same register without passphrase; consent granted the same way.
- **Backend register:** Creates User (username, usernameHash, passphraseHash, avatarUrl). JWT payload is `{ userId }`, 24h expiry. Consent is stored in Consent table with version from env.
- **Data flow:** Token and user stored in `localStorage` (`izana_token`, `izana_user`). Language in `izana_language`. Redirect to `/chat`.

### 3.2 Chat (Normal Q&A)

- **Frontend:** `sendChatMessage({ message, language, chatId? })` in api.ts always sends **stream: false**. So the backend streaming path is never used by the current UI; every chat is a single request/response.
- **Request:** POST `/api/chat` with body `{ message, language, chatId?, title?, stream: false }`, headers `Authorization: Bearer <token>`.
- **Backend chat flow:**
  1. Validate message; load userId from JWT.
  2. **Topic filter:** `classifyReproductiveHealthQuery(message, language)` (topicFilter.js). Keyword fast-path only for off-topic (e.g. weather); if any on-topic keyword present, LLM classifies. If off-topic and confidence ≥ threshold → create/find chat, save user message, return `{ response: politeMessage, suggested_questions: threeQuestions, citations: [], offTopic: true }` (no LLM call for content).
  3. **On-topic:** Build system prompt (language, follow-up format [Q1][Q2][Q3]). Prompt router: `getPromptAdjustments(category)` where category is "bloodwork" if message includes "blood", else "general" (from TrainingFeedback averages; low score → extra instructions, lower temperature).
  4. **RAG:** `generateQuestionVariants(message, language)` → 5 strings. `searchAndRank(original, variants, topKPerQuery)` → Pinecone queries for each variant to `knowledgeBase` index, merge/dedupe, LLM ranks passages and returns matchScore. If context exists, append to system prompt; ragHit = (matchScore ≥ RAG_MATCH_THRESHOLD). If no context or RAG error, ragHit false, ragConfidence 0.
  5. Create or load Chat; save user Message (with optional encryption).
  6. **Non-streaming branch (used by frontend):** `getLLMResponse(systemPrompt, message, opts)` → parse [Q1][Q2][Q3] from response → save AI Message → log UserActivity (chat_message with confidence, matchScore, document) → if ragConfidence < threshold or !ragHit, log knowledge_gap (source: 'chat') → vectorizeAndStore for userdata → respond `{ response, suggested_questions, citations, matchScore }`.
- **Frontend chat state:** Messages live only in React state. No load of existing messages from the server when opening the page, even when `chatId` is in the URL (e.g. from profile “View”). So when user clicks “View” on a chat from profile, they land on `/chat?chatId=...` with **empty** messages; only new sends use that chatId and append server-side.

**Gap:** Backend supports streaming (res.write SSE) but frontend never requests it (stream: false). So streaming is dead code from the client’s perspective. **Gap:** Chat history is never loaded in the UI when navigating to an existing chat.

### 3.3 Bloodwork (PDF Upload and “Confirm & Analyze”)

- **Entry points in UI:**
  1. User types “blood work” or “bloodwork” → frontend does **not** call the API; it appends a bot message with upload prompt and shows “Select PDF”. On file select → `handleFileUpload` → `analyzeBloodWork(file, langCode)`.
  2. Or user could theoretically go to a dedicated bloodwork flow; the same `analyzeBloodWork` is used.
- **analyzeBloodWork:** POST `/api/analyze-bloodwork`, multipart: file + language. Backend: verifyJWT, requireConsent, multer (5MB), pdf-parse, `buildBloodworkPrompt(langCode)`, optional RAG from bloodwork index for context, then `getLLMResponse(..., responseFormat: 'json')`. Parse JSON (with retry logic), normalize results, encrypt if enabled, save BloodWorkReport, vectorizeBloodwork, per-marker KB check and knowledge_gap logging (source: 'bloodwork'), bloodwork_upload activity. Response: `{ results, summary, fertility_note, suggested_questions }`.
- **After PDF success:** Frontend sets `bloodWorkData` and opens `BloodWorkConfirm` modal. User can edit/add markers and choose treatment; on Confirm → `handleBloodWorkConfirm(confirmedData)`.
- **handleBloodWorkConfirm:** Closes modal, appends a user message (“Analyze my lab results: …”), then calls **sendChatMessage** with:
  - `message: "Please analyze these fertility blood work results and provide a detailed interpretation."`
  - `clinical_data: { results: confirmedData.results }`
  - `treatment: confirmedData.treatment`
  - Same chatId if present.
- **Backend chat route:** Does **not** read `clinical_data` or `treatment` from the body. So the second step (chat “analysis”) is a generic RAG+LLM answer to that fixed sentence; the actual lab results and treatment are **not** injected into the prompt. So the “Confirm & Start Analysis” flow does not pass structured lab data into the model.

**Gap:** Backend chat handler ignores `clinical_data` and `treatment`; the “analysis” after confirm is not personalized with the confirmed lab results.

### 3.4 Feedback

- **Session end:** On beforeunload, frontend sends `sendBeacon` to `/api/feedback` with body `{ type: 'session_end', sessionDuration, messageCount }`. No auth in sendBeacon by default; if the frontend added auth headers to a beacon, some browsers may not send them. So session_end may often be unauthenticated (backend stores feedback only when JWT is present).
- **Explicit feedback:** After rating a message, frontend calls `submitFeedback({ question, answer, rating, reason, suggested_questions })` (with getAuthHeaders) or `rateMessage(messageId, rating)` (POST `/api/chat/rate`, JWT). Both can create UserActivity (type 'feedback') and TrainingFeedback; rate also validates messageId and chat ownership.
- **Flow:** submitFeedback → POST `/api/feedback` (index.js) → if Bearer present, decode JWT and create UserActivity (feedback or session_end). rateMessage → chat route → TrainingFeedback + UserActivity (feedback). So feedback can reach admin stats from both paths.

### 3.5 Profile

- **Frontend:** On load, reads `izana_user` from localStorage, then `fetchUserProfile(user.username)` with getAuthHeaders(). So token is sent.
- **Backend:** GET `/api/user-profile/:username` in profile.js has **no verifyJWT**. It finds the user by username and returns chats (last 24h, with message count) and bloodWorkReports (last 24h). So anyone who can call the API with a username gets that user’s profile data; the server does not check that the caller is the same user.

**Gap:** Profile GET is not protected by authentication; it is “public by username”.

### 3.6 Admin

- **Access:** Frontend sends PIN to POST `/api/admin/verify-pin`; on success stores admin_key in localStorage and uses header `x-admin-key` (or `X-Admin-Key`) on all admin requests. Backend verifyAdmin compares header to `process.env.ADMIN_PIN` (default '2603').
- **Stats:** GET `/api/admin/stats` returns gaps, gapsChat, gapsBloodwork, feedback, doc_usage, kb_sources (from UserActivity aggregation).
- **Other:** user-analytics, users, user-analytics/:userId, knowledge-gaps, pending-improvements, approve-gap. All behind verifyAdmin.

---

## 4. UI and UX Flow (Component and State)

### 4.1 Landing / Onboarding (app/page.tsx)

- **Single page, step state:** `step`: 'language' | 'consent' | 'registration' | 'security' | 'login'.
- **Language:** Grid of languages; `selectedLang` → Continue → set step to consent; store language in localStorage on continue.
- **Consent:** Checkbox; `consent` state; “I Agree” → step registration.
- **Registration:** Fetches usernames/avatars (or fallback); user picks username + avatar; shuffle refetches options. Continue → step security (or login if “I already have an account”).
- **Security:** Optional passphrase + confirm; “Secure with passphrase” → registerAnonymous with passphrase + grantConsent + redirect /chat; “Skip” → register without passphrase + grantConsent + redirect /chat.
- **Login:** Username input → checkAuthMethods → if exists, show passphrase or passkey; on success store token/user and redirect /chat.

All state is local (useState); no global store. Token and user stored in localStorage for subsequent API calls.

### 4.2 Chat (app/chat/page.tsx)

- **Wrapper:** Suspense + useSearchParams for chatId; actual content in ChatPageContent.
- **State:** messages (array of ChatMessage), input, isLoading, loadingStep, langCode, showLangPicker, showBloodWorkModal, bloodWorkData, isUploadingPdf. Refs: messagesEndRef, fileInputRef, sessionStartRef, messageCountRef.
- **Mount:** If no token, redirect /. Else fetchConsentStatus(); if !hasConsent redirect /. So chat is gated by token and consent on client.
- **Empty state:** “How can Izana help?” + grid of TOPIC_ICONS (e.g. IVF, IUI, Male Fertility). Clicking one calls handleSend(query, true) (isHidden so no duplicate user bubble if needed) and triggers normal sendChatMessage.
- **Messages:** Rendered from state. User bubbles right, bot left with logo. Bot shows: content (with optional GeminiFadeText “animation”), citations, suggested_questions (buttons that call handleSend(q)), and either MicroFeedback (every 3rd bot message) or InlineStarRating. For “blood work” trigger, bot shows upload prompt and “Select PDF” button that opens file input.
- **Input:** Single line, Enter to send, Send button. No loading of history when chatId is in URL.
- **Bloodwork PDF:** File input (hidden); onChange → handleFileUpload → analyzeBloodWork → on success open BloodWorkConfirm with bloodWorkData; on confirm → handleBloodWorkConfirm → sendChatMessage (with clinical_data/treatment that backend ignores).
- **Header:** Back arrow (clear or go home), title, language picker, profile, logout. Language picker writes to localStorage and langCode state.
- **Feedback:** Thumbs (MicroFeedback) map to handleRate(id, 5) or (id, 1). Stars (InlineStarRating) with optional reason; handleRate and handleFeedbackReason call submitFeedback or (for rating) could be extended to rateMessage when messageId is available (currently feedback by message is not tied to server messageId in submitFeedback path; rateMessage is separate and used when you have messageId from server — but in current chat, messages have client-side id only, so rateMessage would need to be called with the server message id after a send that returns it; currently the backend does not return messageId in the chat response).

**UX nuance:** “View” from profile opens chat with empty state; user may not realize they are in the same thread. No indication of “current chat” title or that history exists on server.

### 4.3 Profile (app/profile/page.tsx)

- **Load:** Get user from localStorage, fetchUserProfile(username). Shows loader then dashboard: conversations (list of chats with View/Delete), bloodwork (list of reports), data rights (export/delete). View chat → router.push(`/chat?chatId=${chatId}`). Delete chat → deleteChat(username, chatId) (backend verifyJWT, so authenticated).
- **Export/Delete:** exportUserData, deleteUserData from api; GDPR flows. Require confirmation for delete.

### 4.4 Admin (app/admin/page.tsx)

- **Gate:** If no izana_admin_key in localStorage, show PinEntry; else Dashboard.
- **Dashboard:** Tabs: Knowledge Gaps (gapsChat / gapsBloodwork tables, pending improvements), Document Usage & KB Sources, User Feedback, User Analytics (chat vs bloodwork sections, sentiment, device), Users. Data from fetchAdminStats, fetchUserAnalytics, fetchAdminUsers, fetchPendingImprovements. Approve/dismiss gap with optional answer (approve-gap).

---

## 5. Critical Gaps and Inconsistencies (For Fixes)

1. **Chat history not loaded:** Opening `/chat?chatId=...` never fetches messages for that chat; UI is always empty for that thread. Backend has messages in DB; frontend needs an endpoint to get messages by chatId (with verifyJWT and ownership) and to load them on mount when chatId is present.
2. **clinical_data / treatment ignored in chat:** Frontend sends clinical_data and treatment in the “Confirm & Start Analysis” flow, but the chat route does not use them. So the “analysis” is not personalized. Backend chat handler should accept optional clinical_data/treatment and inject them into the system or user prompt for that request.
3. **Profile GET not auth-protected:** GET `/api/user-profile/:username` returns chats and bloodwork by username without verifying that the requester is that user. Should require verifyJWT and ensure req.userId matches the user for that username.
4. **Streaming unused:** Backend supports stream: true and sends SSE; frontend always sends stream: false. Either remove streaming from backend or add a streaming client path (e.g. EventSource or fetch with stream) for better perceived performance.
5. **Session-end feedback may be unauthenticated:** sendBeacon does not attach Authorization by default; so session_end might not be tied to userId. Consider a different way to send session_end (e.g. queued fetch with auth before unload) or accept that it’s anonymous.
6. **rateMessage vs submitFeedback:** Chat UI uses submitFeedback for star rating (with question/answer/reason); rateMessage exists for server-side messageId. If you want “rate this message” to be stored with messageId, the backend would need to return messageId in the chat response and the frontend would call rateMessage with it; currently the response does not include messageId.

---

## 6. RAG and Topic Filter (Detailed)

- **topicFilter.js:** keywordFastPath: if message has any on-topic keyword → return null (force LLM). If only off-topic keywords → return off-topic. Otherwise LLM classifier with JSON output (onTopic, confidence). getOffTopicMessage(language) and getOffTopicSuggestedQuestions(language) return localized strings.
- **ragMultiQuery.js:** generateQuestionVariants uses LLM to produce 5 variants (JSON). searchAndRank: for each variant call querySimilar(..., 'knowledgeBase'), merge by id, sort by score, take top 10, then LLM rank (bestIndices, matchScore). Return context string, citations, matchScore, document. Backend uses matchScore as ragConfidence; if below RAG_MATCH_THRESHOLD or !ragHit, logs knowledge_gap.
- **Pinecone:** knowledgeBase index for RAG; userdata for vectorizeAndStore(chat); bloodwork index (or userdata) for bloodwork. querySimilar(text, topK, filter, source) uses textToVector (Xenova BGE); if embedding fails or zero vector, returns [].
- **promptRouter.js:** getPromptAdjustments(category) from TrainingFeedback groupBy; if category has low average score, returns extra instructions and lower temperature; otherwise default.

---

## 7. Summary Table: Who Uses What

| Feature           | Frontend state / trigger     | API called                    | Backend uses consent? | Backend uses body fully? |
|-------------------|-----------------------------|-------------------------------|------------------------|---------------------------|
| Register          | step, selectedLang, consent | register-anonymous, consent  | N/A                    | Yes                       |
| Chat send         | messages, input, chatId     | POST /api/chat (stream: false)| Yes (requireConsent)   | message, language, chatId; **not** clinical_data, treatment |
| Bloodwork PDF     | file input, bloodWorkData   | POST /api/analyze-bloodwork   | Yes                    | Yes                       |
| Bloodwork confirm | BloodWorkConfirm → confirm  | POST /api/chat (clinical_data)| Yes                    | **No** (ignored)          |
| Profile load      | profile, user from storage  | GET /api/user-profile/:username | **No** (no auth)     | Yes                       |
| Feedback          | handleRate, handleFeedbackReason, beforeunload | /api/feedback, /api/chat/rate | N/A (feedback); rate is JWT | Yes                  |
| Admin             | admin key in localStorage   | GET/POST /api/admin/*         | verifyAdmin (PIN)      | Yes                       |

This deep dive should give you a complete picture of structure, data flow, and UI/UX so you can target modifications (e.g. load chat history, use clinical_data in chat, protect profile, or fix feedback/session_end) without breaking existing behavior.
