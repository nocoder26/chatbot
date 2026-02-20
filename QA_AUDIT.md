# QA Audit — Izana AI

Current test coverage analysis and gap identification against Architecture Zones.

---

## Current Test Status

**Total test files: 0**

Neither the frontend nor the backend contains any test files. The project has no automated testing whatsoever.

---

## Gap Analysis by Zone

### Red Zone Gaps (CRITICAL — Priority 1)

| File | Risk | Gap |
|------|------|-----|
| `backend-node/src/routes/register.js` | User registration with passphrase hashing | No tests for: registration flow, username conflict handling, passphrase hashing, JWT issuance, usernameHash generation |
| `backend-node/src/routes/auth.js` | Login with passphrase verification | No tests for: login success/failure, bcrypt comparison, JWT expiry, invalid credentials |
| `backend-node/src/routes/passkey.js` | WebAuthn registration and authentication | No tests for: challenge generation, attestation verification, credential storage, counter update, login flow |
| `backend-node/src/middleware/auth.js` | JWT verification | No tests for: valid token, expired token, missing token, malformed token |
| `backend-node/prisma/schema.prisma` | Database schema | No migration tests, no schema validation tests |
| `backend-node/src/cron/privacyDeletion.js` | 24-hour data deletion | No tests for: correct cutoff calculation, cascade deletion order, data retention boundary |
| `backend-node/src/index.js` | CORS, route mounting | No tests for: CORS headers, route availability, 404 handler |
| `backend-node/src/lib/pinecone.js` | Vectorization before deletion | No tests for: vector generation, Pinecone upsert, graceful degradation when Pinecone is unavailable |

### Yellow Zone Gaps (HIGH — Priority 2)

| File | Risk | Gap |
|------|------|-----|
| `backend-node/src/routes/chat.js` | Core chat | No integration tests for: message creation, chat creation, streaming, LLM error handling, activity logging |
| `backend-node/src/routes/bloodwork.js` | PDF analysis | No tests for: PDF parsing, AI response parsing, result normalization, activity logging |
| `backend-node/src/routes/profile.js` | User profile | No tests for: user lookup, 24h cutoff, chat deletion authorization |
| `backend-node/src/routes/admin.js` | Admin endpoints | No tests for: PIN verification, analytics aggregation, drill-down, admin key validation |
| `backend-node/src/lib/llm.js` | LLM client | No tests for: stream handling, error propagation, Groq API key absence |
| `frontend/src/lib/api.ts` | API functions | No tests for: URL resolution, error handling, auth headers, response parsing |
| `frontend/src/app/page.tsx` | Onboarding | No render tests, no interaction tests for auth flow |
| `frontend/src/app/chat/page.tsx` | Chat UI | No render tests, no message handling tests |
| `frontend/src/app/admin/page.tsx` | Admin UI | No render tests, no tab interaction tests |

### Green Zone Gaps (MODERATE — Priority 3)

| File | Risk | Gap |
|------|------|-----|
| `frontend/src/app/profile/page.tsx` | Profile display | No snapshot tests |
| `frontend/src/app/admin/lab-reviews/page.tsx` | Lab reviews table | No snapshot tests |
| `frontend/src/components/BloodWorkConfirm.tsx` | BloodWork modal | No render tests |
| `backend-node/src/lib/usernames.js` | Username generation | No tests for: output format, uniqueness, count |

---

## Priority Action Items

### Immediate (Red Zone)

1. **Auth integration tests** — Register, login, passkey flows with mocked DB
2. **JWT middleware tests** — All token states (valid, expired, missing, malformed)
3. **Privacy deletion tests** — Verify correct deletion boundaries and cascade order
4. **CORS tests** — Verify allowed/blocked origins

### Short-term (Yellow Zone)

5. **Chat route integration tests** — Message creation, streaming, error handling
6. **Bloodwork route tests** — PDF parsing with sample PDFs, AI response parsing
7. **Admin endpoint tests** — PIN verification, analytics queries
8. **Frontend API tests** — URL resolution logic, error handling paths

### Ongoing (Green Zone)

9. **Snapshot tests** for all pages
10. **Component render tests** for reusable components

---

## Estimated Effort

| Priority | Files to Test | Estimated Tests | Effort |
|----------|--------------|----------------|--------|
| Red Zone | 8 files | ~40 tests | 2-3 days |
| Yellow Zone | 9 files | ~35 tests | 2 days |
| Green Zone | 5 files | ~10 tests | 0.5 days |
| **Total** | **22 files** | **~85 tests** | **~5 days** |
