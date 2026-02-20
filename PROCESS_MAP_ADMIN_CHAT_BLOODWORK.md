# Process Map: Admin Panel Stats, Chat Response Generation, and Bloodwork Analysis

High-accuracy, detailed mapping of how each process works in the codebase.

---

## 1. How Admin Panel Stats Are Populated

### 1.1 Entry Point and Auth

- **Frontend:** User opens `/admin`. If `localStorage.izana_admin_key` is missing, the **PinEntry** component is shown. User submits a PIN → `verifyAdminPin(pin)` → **POST /api/admin/verify-pin** with body `{ pin }`.
- **Backend:** `backend-node/src/routes/admin.js`. No middleware on verify-pin; handler compares `req.body.pin` to `process.env.ADMIN_PIN` (default `'2603'`). If equal, returns `{ authenticated: true, admin_key: ADMIN_KEY }`. Frontend stores `admin_key` in `localStorage.izana_admin_key`.
- **All other admin requests:** Frontend sends header **X-Admin-Key** (or x-admin-key) with value equal to the stored admin key. Every other admin route uses **verifyAdmin** middleware: reads `req.headers['x-admin-key']` and compares to `ADMIN_KEY`; if missing or unequal, responds **401 Unauthorized**.

### 1.2 Data Sources: UserActivity and Other Tables

Admin stats are **not** computed from raw Chat/Message rows in real time. They are derived from:

1. **UserActivity** (Prisma model `UserActivity`): rows created across the app with `type` and `metadata` (JSON). This is the **primary source** for stats and gaps.
2. **User, Chat, BloodWorkReport** (counts and lists for user-analytics and users).
3. **TrainingFeedback** (used by prompt router; not directly shown in admin stats).
4. **Knowledge-gap analysis** (modelImprovement): used only by **GET /api/admin/knowledge-gaps**, not by the main stats dashboard.

**Where UserActivity rows are created (so they can appear in admin):**

| Activity type            | Where created | Metadata shape (relevant for admin) |
|--------------------------|---------------|--------------------------------------|
| `topic_classification`   | Chat route (POST /api/chat) | `query`, `onTopic`, `confidence`, `language` |
| `chat_message`           | Chat route after successful on-topic reply | `question`, `chatId`, `category`, `confidence`, `matchScore`, `usedKnowledgeBase`, `document` |
| `knowledge_gap`          | Chat route (when RAG confidence &lt; threshold or !ragHit); Bloodwork route (per uncovered marker) | `question`, `category`, `confidence`, `source` ('chat' or 'bloodwork'), optional `marker` |
| `feedback`               | POST /api/feedback (index.js) when JWT present; POST /api/chat/rate | `question`, `rating`, `reason`; or `messageId`, `rating`, `category` |
| `session_end`            | POST /api/feedback with `type: 'session_end'` and JWT | `sessionDuration`, `messageCount`, etc. |
| `bloodwork_upload`       | Bloodwork route after successful analysis | `markers` (array of `{ name, status }`), `markerCount`, `coveredByKB`, `uncoveredByKB`, `uncoveredMarkers` |
| `device_info`            | Register route when `deviceInfo` is sent | `browser`, `os`, `screen`, `language`, `timezone` |
| `login`                  | Register / auth | `method` (e.g. 'passphrase') |

None of these are written by the admin panel itself; the admin panel only **reads** them.

### 1.3 GET /api/admin/stats — How the “Stats” Tab Is Filled

**Called by:** `fetchAdminStats(adminKey)` in `frontend/src/lib/api.ts` → **GET /api/admin/stats** with header **X-Admin-Key**.

**Backend flow** (`backend-node/src/routes/admin.js`, `GET /stats`, verifyAdmin):

1. **logAuditEvent** with action `admin_access`, tier `tier1`, endpoint `/stats`.
2. **Single query:**  
   `prisma.userActivity.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })`  
   So the last **200** activities (any type) are loaded.
3. **Gaps (knowledge gaps + low-confidence chat):**
   - Filter activities where:
     - `type === 'knowledge_gap'`, **or**
     - `type === 'chat_message'` **and** `metadata.confidence < 0.5` **and** `!metadata.usedKnowledgeBase`.
   - Map each to: `id`, `question` (from metadata), `type` (category/source), `score` (confidence), `marker`, `source` ('chat' or 'bloodwork'), `timestamp`.
   - **gapsChat** = gaps with `source === 'chat'`.
   - **gapsBloodwork** = gaps with `source === 'bloodwork'`.
4. **Feedback:**
   - Filter activities where `type === 'feedback'`.
   - Map to: `rating`, `reason`, `question` (all from metadata).
5. **Document usage (for “Document Usage” and KB sources):**
   - Filter activities where `type === 'chat_message'` **and** `metadata.document` is present.
   - Map to `{ document, question }`.
6. **KB sources (frequency and keywords):**
   - From the list above, aggregate by `document`:
     - **frequency** = count of times that document appears.
     - **keywords** = from each `question`: split on whitespace, keep words length &gt; 2, take first 10 words per row, merge, dedupe, take first 30.
   - Sort by frequency descending.
7. **Response:**  
   `{ gaps, gapsChat, gapsBloodwork, feedback, doc_usage, kb_sources }`.

**Frontend:** Dashboard stores this in `stats`. The **Knowledge Gaps** tab uses `gapsChat` and `gapsBloodwork` in two tables. **User Feedback** tab uses `stats.feedback`. **Document Usage & KB Sources** tab uses `stats.doc_usage` (aggregated into `docCounts` for the table) and `stats.kb_sources` for the “Knowledge base sources (frequency & keywords)” table.

### 1.4 GET /api/admin/user-analytics — How the “User Analytics” Tab Is Filled

**Called by:** `fetchUserAnalytics(adminKey)` → **GET /api/admin/user-analytics** with **X-Admin-Key**.

**Backend flow:**

1. **Cutoff:** `new Date(Date.now() - 24 * 60 * 60 * 1000)` (24 hours ago).
2. **Five parallel queries:**
   - **activeUsers:** `prisma.user.count({ where: { createdAt: { gte: cutoff } } })`.
   - **totalConversations:** `prisma.chat.count({ where: { createdAt: { gte: cutoff } } })`.
   - **totalBloodwork:** `prisma.bloodWorkReport.count({ where: { createdAt: { gte: cutoff } } })`.
   - **recentActivities:** `prisma.userActivity.findMany({ where: { createdAt: { gte: cutoff } }, orderBy: { createdAt: 'desc' }, take: 50, select: id, userId, type, metadata, createdAt })`.
   - **deviceActivities:** `prisma.userActivity.findMany({ where: { type: 'device_info', createdAt: { gte: cutoff } }, select: { metadata: true } })`.
3. **From recentActivities:**
   - **topQuestionCategories:** among activities with `type === 'chat_message'` and `metadata.category`, count by category; sort by count desc; take top 10 → `{ category, count }`.
   - **bloodworkPatterns:** among activities with `type === 'bloodwork_upload'` and `metadata.markers` array, for each marker with `status === 'Out of Range'` count by marker name; sort by count desc; take top 10 → `{ marker, count }`.
   - **sentimentBreakdown:** among activities with `type === 'feedback'`, count where `metadata.rating >= 4` (positive), `<= 2` (negative), `=== 3` (neutral).
   - **avgSessionDuration:** among activities with `type === 'session_end'` and `metadata.sessionDuration`, average `sessionDuration` (rounded integer).
4. **deviceBreakdown:** from deviceActivities, aggregate metadata into `browsers`, `os`, `screens`, `timezones` (count per value).
5. **Response:**  
   `activeUsers`, `totalConversations`, `totalBloodwork`, `recentActivities` (with userId anonymized to `user_${userId.slice(0,8)}`), `topQuestionCategories`, `bloodworkPatterns`, `sentimentBreakdown`, `avgSessionDuration`, `deviceBreakdown`.

**Frontend:** Stored in `analytics`. The Analytics tab shows the four metric cards, sentiment breakdown, “Chat — Top question categories”, “Bloodwork — Common out-of-range markers”, device breakdown, and the “Recent Activity” list (each item clickable for drill-down).

### 1.5 GET /api/admin/users — How the “Users” Tab Is Filled

**Called by:** `fetchAdminUsers(adminKey)` → **GET /api/admin/users** with **X-Admin-Key**.

**Backend flow:**

1. **Cutoff:** 24 hours ago (same as user-analytics).
2. **Query:**  
   `prisma.user.findMany({ where: { createdAt: { gte: cutoff } }, include: _count(chats, bloodWorkReports, activities), activities (orderBy desc, select type, metadata, createdAt), chats (select _count(messages)) }, orderBy: { createdAt: 'desc' } })`.
3. **Per user**, compute:
   - **messageCount:** sum of `chat._count.messages` over all chats.
   - **feedbackActivities:** activities with `type === 'feedback'`.
   - **avgRating:** average of `metadata.rating` from those feedback activities (if any).
   - **lastActiveAt:** max of activity `createdAt`, else user `createdAt`.
   - **sessionDuration:** if ≥2 activities, max timestamp − min timestamp; else 0.
   - **thumbsUp / thumbsDown:** count of feedback with rating ≥ 4 and ≤ 2.
4. **Response:** `{ users: userList }` with each user’s `userId` (anonymized), `messageCount`, `chatCount`, `bloodworkCount`, `activityCount`, `avgRating`, `lastActiveAt`, `sessionDuration`, `thumbsUp`, `thumbsDown`. List sorted by `activityCount` desc.

**Frontend:** Stored in `userList`; displayed in the Users table. Clicking a row calls **fetchUserDrillDown(adminKey, userId)** → **GET /api/admin/user-analytics/:userId**, which returns that user’s activities, chats (with messages), and bloodwork reports (all filtered by same 24h cutoff and user id prefix match).

### 1.6 GET /api/admin/pending-improvements

**Called by:** `fetchPendingImprovements(adminKey)` when the dashboard loads.

**Backend:** `prisma.userActivity.findMany({ where: { type: 'knowledge_gap' }, orderBy: { createdAt: 'desc' }, take: 100 })`. Filter to those with `!metadata.resolved`. Return `{ total, items }` with id, question, marker, source, category, confidence, timestamp. These are the “Pending KB Improvements” blocks on the Knowledge Gaps tab; admin can approve (with optional answer, which is upserted to Pinecone as anonymized vector) or dismiss. Approve/dismiss updates the activity’s metadata with `resolved: true` and resolution action.

### 1.7 Summary: Admin Stats Data Flow

```
UserActivity (and User/Chat/BloodWorkReport) rows
    ↑
    written by: Chat route, Bloodwork route, POST /api/feedback, POST /api/chat/rate, Register (device_info, login)
    ↓
GET /api/admin/stats        → last 200 activities → gaps, gapsChat, gapsBloodwork, feedback, doc_usage, kb_sources
GET /api/admin/user-analytics → 24h counts + last 50 activities + device_info → aggregates (categories, bloodwork patterns, sentiment, session, device)
GET /api/admin/users         → 24h users + includes → per-user metrics
GET /api/admin/user-analytics/:id → one user’s activities, chats, bloodwork
GET /api/admin/pending-improvements → knowledge_gap activities not resolved
```

---

## 2. How the Response to User Queries Is Generated (Chat)

### 2.1 Request and Middleware

- **Endpoint:** **POST /api/chat** (body: `message`, `language`, optional `chatId`, `title`, `stream`, `clinical_data`, `treatment`).
- **Middleware (order):** **verifyJWT** (sets `req.userId` from JWT), **requireConsent** (403 if no valid consent). Frontend currently sends **stream: false** and includes optional `clinical_data` / `treatment` after bloodwork confirm.

### 2.2 Build Effective User Message

- **effectiveMessage** starts as `message.trim()`.
- If `clinical_data.results` is a non-empty array: append  
  `"\n\n[Attached lab results for interpretation:]\n" + lines`  
  where each line is `"${name}: ${value} ${unit}"`.
- If `treatment` is a non-empty string: append  
  `"\n\nCurrent treatment context: " + treatment.trim()`.
- This **effectiveMessage** is what the model and RAG see; the **stored** user message in the DB remains the original `message.trim()`.

### 2.3 Topic Classification (Topic Filter)

- **Purpose:** Decide if the query is about reproductive/fertility health. If off-topic with high confidence, return a fixed scope message and suggested questions without calling the main LLM.
- **Code:** `backend-node/src/lib/topicFilter.js` → **classifyReproductiveHealthQuery(message, language)**.

**Steps:**

1. **Keyword fast-path (off-topic only):**
   - **keywordFastPath(message):**
     - If message contains any **on-topic** keyword (e.g. fertility, ivf, pregnancy, hormone, amh, …) → return **null** (do not fast-path; always use LLM for classification when on-topic terms present).
     - Else if message contains **off-topic** keyword (e.g. weather, recipe, cooking, sports, …) → return `{ onTopic: false, confidence: 0.85 }`.
     - Else return null.
2. **If fast-path returned null:** Call **getLLMResponse** with:
   - **System:** Strict classifier; output only JSON: `{"onTopic": true|false, "confidence": 0..1}`; rules for on-topic (fertility, reproduction, …) vs off-topic (cooking, weather, …); examples.
   - **User:** message (trimmed, first 500 chars).
   - **Options:** temperature 0, maxTokens 80, timeout 6s, responseFormat 'json'.
3. **Parse** LLM output with **parseClassifierResponse** (extract onTopic and confidence; on parse failure default to on-topic, confidence 0.5).

**Chat route after classification:**

- **UserActivity** created with `type: 'topic_classification'`, metadata: `query`, `onTopic`, `confidence`, `language` (fire-and-forget).
- If **!onTopic && confidence >= TOPIC_FILTER_THRESHOLD** (default 0.5):
  - Resolve or create **Chat**, save **Message** (user), then return **200** with:
    - **response:** **getOffTopicMessage(language)** (localized “Izana is your reproductive health companion…”).
    - **suggested_questions:** **getOffTopicSuggestedQuestions(language)** (exactly 3 localized questions, e.g. “What is IVF?”, “How can I improve my fertility?”, “What do my hormone levels mean?”).
    - **citations:** [].
    - **offTopic: true**.
  - No RAG, no main LLM call.

### 2.4 On-Topic Path: System Prompt and Prompt Routing

- **System prompt:** **buildSystemPrompt(language)** returns a fixed string: role (compassionate health assistant for Izana), “respond entirely in ${langName}”, and **requirement** to end with exactly 3 follow-up questions in the format `[Q1] …`, `[Q2] …`, `[Q3] …`.
- **Category:**  
  `message.trim().toLowerCase().includes('blood')` → `'bloodwork'`, else `'general'`.
- **Prompt routing:** **getPromptAdjustments(category)** (`backend-node/src/lib/promptRouter.js`):
  - Reads **TrainingFeedback** (groupBy questionCategory, avg qualityScore) every 1 hour (refreshScores).
  - If category has avg score **&lt; 3.0** and at least 3 samples: return `extraInstructions` (“Be extra precise…”), `topK: 5`, `temperature: 0.5`.
  - Else: return empty extraInstructions, `topK: 3`, `temperature: 0.7`.
  - **extraInstructions** (if any) are appended to the system prompt.

### 2.5 RAG: Question Variants, Search, Rank, Match Score

- **Code:** `backend-node/src/lib/ragMultiQuery.js` and **backend-node/src/lib/pinecone.js**.

**Steps:**

1. **generateQuestionVariants(effectiveMessage, language):**
   - Single **getLLMResponse** with system: “output exactly 5 variant questions as JSON: {\"variants\": [\"q1\", …]}\” and user: “User question: …”.
   - Parse JSON; if parsing fails or list short, use original question plus up to 4 variants → **5 strings** (original first).
2. **searchAndRank(originalQuestion, variantQuestions, topKPerQuery):**
   - **For each** of the 5 variant strings:
     - **querySimilar(variant, topKPerQuery, {}, 'knowledgeBase')**:
       - **textToVector(variant)** via Xenova BGE (`EMBEDDING_MODEL`, 1024 dims). If model disabled or zero vector, return [].
       - **Pinecone** query on **knowledgeBaseIndex**: vector, topK, includeMetadata. Returns matches with `score`, `metadata.text` or `metadata.content`, `metadata.source` or `metadata.document`.
   - **Merge** all matches, **dedupe by id** (id = record id or derived from source+text slice).
   - **Sort** merged list by score desc, **take top 10**.
   - **LLM rank:** One **getLLMResponse** with system: “You are a relevance judge… Respond with JSON only: {\"bestIndices\": [0,1,…], \"matchScore\": 0.0 to 1.0}” and user: “User question: … Passages: [0] …, [1] …”. Parse **bestIndices** and **matchScore**; validate indices and clamp matchScore to [0,1]. If parse fails, use first passage and vector score as matchScore.
   - **Selected passages** = bestIndices into the top-10 list (or [0]).
   - **context** = concatenation of selected passage texts with `\n---\n`.
   - **citations** = unique list of `source`/`document` from selected passages.
   - **document** = first citation.
   - Return **context**, **citations**, **matchScore**, **document**.
3. **In chat route:** If **context** is non-empty, append to system prompt:  
   “Use the following verified medical context to ground your answer when relevant. If the context does not fully address the question, use your knowledge in addition:\n” + context.  
   **ragHit** = true only if **matchScore >= RAG_MATCH_THRESHOLD** (default 0.35). **ragConfidence** = matchScore; **ragDocument** / **ragCitations** stored for logging and response.

### 2.6 Resolve or Create Chat and Save User Message

- If **chatId** provided: **prisma.chat.findFirst({ where: { id: chatId, userId } })**. If not found → 404.
- Else: **prisma.chat.create** with userId and title (from body or derived from message).
- **prisma.message.create** for the **user** message: role `'user'`, content = original `message.trim()`, optional encryption.

### 2.7 Generate AI Reply (Non-Streaming Path Used by Frontend)

- **getLLMResponse(systemPrompt, effectiveMessage, { temperature: adjustments.temperature })**.
  - **llm.js:** OpenAI-compatible client (e.g. Groq), **model** from env (e.g. llama-3.3-70b-versatile), messages = [system, user], stream: false, temperature from adjustments.
- **parseFollowUpQuestions(rawResponse):** Regex `\[Q[1-3]\]\s*(.+)` to extract three questions; strip those lines from text → **cleanedText** and **questions** array.

### 2.8 Persist AI Message, Log Activity, Log Gap, Vectorize

- **prisma.message.create** for **ai**: role `'ai'`, content = cleanedText, optional encryption.
- **UserActivity** with `type: 'chat_message'`, metadata: `question` (message slice 200), `chatId`, `category`, `confidence`/`matchScore` = ragConfidence, `usedKnowledgeBase` = ragHit, `document` = ragDocument.
- If **ragConfidence < RAG_MATCH_THRESHOLD || !ragHit**: **UserActivity** with `type: 'knowledge_gap'`, metadata: `question`, `category`, `confidence`, `source: 'chat'`.
- **vectorizeAndStore(userId, 'chat_message', "Q: " + message + "\nA: " + cleanedText.slice(0,500))** → Pinecone **userdata** index (for future use; not used in current RAG retrieval).

### 2.9 Response to Client

- **JSON:** `{ response: cleanedText, suggested_questions: questions, citations: ragCitations, matchScore: ragConfidence }`.

**End-to-end sequence (on-topic):**  
Request → verifyJWT → requireConsent → build effectiveMessage → topic filter (optional UserActivity) → if off-topic return scope message → build system prompt → getPromptAdjustments → RAG (5 variants → Pinecone KB search → LLM rank → context + matchScore) → resolve/create chat → save user message → getLLMResponse(system, effectiveMessage) → parse [Q1][Q2][Q3] → save AI message → log chat_message (and knowledge_gap if low match) → vectorizeAndStore → return JSON.

---

## 3. How Bloodwork Is Analyzed

### 3.1 Request and Middleware

- **Endpoint:** **POST /api/analyze-bloodwork**.
- **Body:** multipart/form-data: **file** (PDF), **language** (optional, default `'en'`).
- **Middleware:** **verifyJWT**, **requireConsent**, **upload.single('file')** (multer, memory storage, 5MB limit).

### 3.2 Validation and PDF Text Extraction

- Require **req.file**; validate **mimetype** or **originalname** ends with `.pdf`.
- **pdf-parse** (dynamic import): `pdfParse(buffer)` → `data.text`. If no text or parse error, return 400 with an error message.
- **truncatedText** = `pdfText.slice(0, 8000)` (first 8000 characters used for the LLM).

### 3.3 Optional RAG Context for Bloodwork

- **querySimilar(truncatedText.slice(0, 500), 3, {}, 'bloodwork')**.
  - **Pinecone:** index = **bloodworkIndex** (or userdata if not set). Vector from **textToVector** (same BGE model). topK 3, includeMetadata.
- If any hits: concatenate `metadata.text` or `metadata.content` with `\n---\n` and append to **bloodworkPrompt**:  
  “Additional reproductive health reference context:\n” + context.
- Failures are logged but do not block the flow.

### 3.4 Bloodwork Prompt and LLM Call

- **buildBloodworkPrompt(langCode)** returns a long system prompt that:
  - Instructs: extract **ALL** lab results; for each result return **name**, **value**, **unit**, **status** (In Range / Out of Range), **description** (1–2 sentences in language, including relevance to fertility/reproductive health when applicable).
  - Asks for **summary** (2–3 sentences, relation to reproductive health), **fertility_note** (if fertility markers missing, suggest tests; if present, interpret for fertility), **suggested_questions** (exactly 3 in language).
  - Requires **only valid JSON**, no markdown/code fences.
- **getLLMResponse(bloodworkPrompt, truncatedText, { temperature: 0.2, maxTokens: 4096, timeout: 60000, responseFormat: 'json' })**.

### 3.5 Parse and Normalize LLM Output

- **extractJSON(aiResponse):** try JSON.parse; if fail, clean (trailing commas, control chars), try again; try ```json``` fence; try first `{` to last `}`. If still no parse:
  - **Retry** with a shorter “Re-extract ALL lab results…” prompt and **responseFormat: 'json'**, temperature 0.1.
- From parsed object:
  - **results** = array (or single object wrapped in array); **summary**, **fertility_note** = strings; **suggested_questions** = array, slice to 3.
- **normalizedResults:** each item has **name**, **value**, **unit** (strings, trimmed); **status** = `'Out of Range'` only if explicitly that, else `'In Range'`; **description** string; filter out items with no name.

### 3.6 Persist Report and Vectorize

- **Optional encryption:** If encryption enabled, encrypt JSON string of results and summary; store in **encryptedData** / **encryptionMeta**.
- **prisma.bloodWorkReport.create**: **userId**, **results** (normalized), **summary**, **encryptedData**, **encryptionMeta**.
- **vectorizeBloodwork(userId, "Bloodwork: " + marker summary string + ". Summary: " + summary)** → Pinecone **bloodwork** (or userdata) index, with metadata type `bloodwork_upload`, hashed userId, etc.

### 3.7 Per-Marker KB Coverage and Knowledge Gaps

- **For each unique marker name** in normalizedResults:
  - **querySimilar(\`${marker} reproductive health reference range\`, 1, {}, 'bloodwork')**.
  - If no hit or score &lt; 0.4: treat as **uncovered**; **UserActivity** with `type: 'knowledge_gap'`, metadata: `question: "Reference data for ${marker} in reproductive health"`, `category: 'Blood Work Gap'`, `confidence` (hit score or 0), `source: 'bloodwork'`, `marker`.
  - Else: **covered**.
- **UserActivity** with `type: 'bloodwork_upload'`, metadata: **markers** (array of { name, status }), **markerCount**, **coveredByKB**, **uncoveredByKB**, **uncoveredMarkers**.

### 3.8 Response to Client

- **JSON:** `{ results: normalizedResults (with name, value, unit, status, description), summary, fertility_note, suggested_questions }`.

**End-to-end sequence:**  
PDF upload → verifyJWT → requireConsent → multer → pdf-parse → optional RAG bloodwork context → buildBloodworkPrompt(lang) → getLLMResponse (JSON) → extractJSON / retry → normalize results → save BloodWorkReport (optional encrypt) → vectorizeBloodwork → per-marker KB check and knowledge_gap activities → bloodwork_upload activity → return JSON.

---

## 4. File Reference Summary

| Process | Main files |
|--------|------------|
| Admin stats | `backend-node/src/routes/admin.js` (GET /stats, /user-analytics, /users, /user-analytics/:id, /pending-improvements); `frontend/src/app/admin/page.tsx`; `frontend/src/lib/api.ts` (fetchAdminStats, fetchUserAnalytics, fetchAdminUsers, fetchUserDrillDown, fetchPendingImprovements) |
| Chat response | `backend-node/src/routes/chat.js` (POST /); `backend-node/src/lib/topicFilter.js`; `backend-node/src/lib/ragMultiQuery.js`; `backend-node/src/lib/promptRouter.js`; `backend-node/src/lib/llm.js`; `backend-node/src/lib/pinecone.js` (querySimilar, textToVector) |
| Bloodwork | `backend-node/src/routes/bloodwork.js`; `backend-node/src/lib/llm.js`; `backend-node/src/lib/pinecone.js` (querySimilar, vectorizeBloodwork, textToVector); pdf-parse |

All admin stats ultimately come from **UserActivity** (and supporting User/Chat/BloodWorkReport) written by chat, bloodwork, feedback, and registration flows; the admin API never writes these, only reads and aggregates them.
