# Version checklist — Chatbot & workflow corrections

Use this to confirm the codebase has all agreed chatbot and workflow corrections before pushing.

---

## Chat flow

| Correction | Location | Status |
|------------|----------|--------|
| **5 question variants** → search KB for all 5 | `backend-node/src/lib/ragMultiQuery.js` — `generateQuestionVariants`, `searchAndRank` | ✓ |
| **85% confidence threshold** (RAG_MATCH_THRESHOLD = 0.85) | `ragMultiQuery.js` line 4; `.env.example` RAG_MATCH_THRESHOLD=0.85 | ✓ |
| **Robust search**: TOP_K_PER_QUERY = 5, strict LLM relevance judge for ≥0.85 | `ragMultiQuery.js` TOP_K_PER_QUERY, rank prompt | ✓ |
| **System prompt**: caring, trustworthy, friendly, tailored to couples undergoing fertility treatment | `backend-node/src/routes/chat.js` — `buildSystemPrompt` | ✓ |
| **3 engaging, highly contextual follow-up questions** in user language | `chat.js` — buildSystemPrompt [Q1][Q2][Q3] | ✓ |
| **KB context always added** when available; below 85%: “partially relevant… supplement with your own knowledge” | `chat.js` — if (context) { both branches } | ✓ |
| **Knowledge gap logged** when &lt; 85% (real time, admin dashboard) | `chat.js` — knowledge_gap activity when ragConfidence < RAG_MATCH_THRESHOLD \|\| !ragHit | ✓ |
| **Document recorded only when used** (match ≥ 85%) for Document Usage tab | `chat.js` — document: ragHit ? (ragDocument \|\| undefined) : undefined | ✓ |

---

## Admin panel — Document Usage & KB Sources

| Correction | Location | Status |
|------------|----------|--------|
| Documents listed only when **used** in a response (≥85% match) | Backend: activity has `document` only when `ragHit`; admin filters `chat_message` with `metadata.document` | ✓ |
| **Which documents are used most** (frequency) | Admin stats: `doc_usage` → `docCounts`, `kb_sources` (frequency + keywords) | ✓ |
| **For which queries which sources** (query → source table) | Admin: `doc_usage` with `timestamp`; frontend “Which queries used which sources” table (Query \| Source \| When) | ✓ |
| **Timestamp** on doc_usage for “When” column | `backend-node/src/routes/admin.js` — docUsage includes `timestamp: a.createdAt` | ✓ |
| **AdminDocUsage** type import (Vercel build) | `frontend/src/app/admin/page.tsx` — import from `@/lib/api` | ✓ |

---

## Pinecone & config

| Correction | Location | Status |
|------------|----------|--------|
| **KB index** 1024 dims; optional host URL | `backend-node/src/lib/pinecone.js` — PINECONE_KB_INDEX, PINECONE_KB_HOST | ✓ |
| **Userdata index** 1024 dims; optional host URL | `pinecone.js` — PINECONE_USERDATA_INDEX, PINECONE_USERDATA_HOST | ✓ |
| **.env.example**: KB/userdata index names and hosts, RAG_MATCH_THRESHOLD, RAG_TOP_K, RAG_TOP_K_PER_QUERY | `backend-node/.env.example` | ✓ |
| User queries stored in userdata (GDPR: hashed userId) | `chat.js` — `vectorizeAndStore(userId, 'chat_message', …)`; `pinecone.js` uses `hashUserId` | ✓ |

---

## Other

| Item | Status |
|------|--------|
| No UI changes on customer-facing chat (language, layout unchanged) | ✓ |
| PROCESS_MAP_ADMIN_CHAT_BLOODWORK.md documents flows | ✓ |

---

*Last verified: checklist created against current codebase. Run `npm test` and `npm run test:e2e` locally before pushing.*
