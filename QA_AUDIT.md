# QA Audit — Test Coverage Gap Analysis

> Izana AI Codebase | `working-base-version` baseline
> Current: **75 backend tests, 0 frontend tests**

---

## 1. Coverage Summary by Zone

### RED ZONE Coverage

| File / Function | Tests Exist | Coverage Grade | Gaps |
|----------------|-------------|---------------|------|
| `admin.py` → `verify_pin()` | Yes (5 tests) | **B+** | Missing: brute-force timing test, PIN type coercion (int vs string), response body schema validation |
| `admin.py` → `verify_admin()` dependency | Yes (4 tests) | **B** | Missing: header case sensitivity, multiple header values, timing-safe comparison |
| `admin.py` → API key generation | No | **F** | No test verifies `hashlib.sha256` key generation logic, collision resistance, or determinism |
| `main.py` → CORS config | No | **F** | No test verifies CORS headers on actual HTTP responses; regex pattern matching untested |
| `chat.py` → `sanitize_input()` | Yes (12 tests) | **A-** | Missing: unicode bypass attempts, nested injection patterns, very long strings |
| `chat.py` → AI client initialization | No | **F** | No test verifies graceful degradation when individual services fail to initialize |

**Red Zone Score: 58% covered, 42% critical gaps**

### YELLOW ZONE Coverage

| File / Function | Tests Exist | Coverage Grade | Gaps |
|----------------|-------------|---------------|------|
| `chat.py` → `chat_endpoint()` | Yes (8 tests) | **B** | Missing: blood work with empty results, translation error mid-response, Pinecone timeout, QC model returning invalid JSON |
| `chat.py` → `rerank_results()` | Yes (4 tests) | **A-** | Missing: reranker returns fewer results than input, document with empty metadata |
| `chat.py` → `translate_with_groq()` | Yes (4 tests) | **B-** | Missing: translation returns very short text (<5 chars), Groq timeout, translation of suggested questions individually |
| `chat.py` → `submit_feedback()` | Yes (6 tests) | **B+** | Missing: concurrent feedback for same question, very long answer text |
| `chat.py` → `save_log()` | Yes (4 tests) | **B** | Missing: concurrent write race condition, disk full scenario |
| `chat.py` → `clean_citation()` | Yes (5 tests) | **A** | Adequate |
| `chat.py` → Pydantic models | Partial (3 tests) | **C+** | Missing: `clinical_data` nested validation, `treatment` field validation, `language` code enum validation |
| `main.py` → `analyze_bloodwork()` | Yes (3 tests) | **C** | Missing: multi-page PDF, password-protected PDF, very large text extraction, malformed PDF, LLM returning invalid JSON |
| `api.ts` (frontend) | No | **F** | Zero tests for any API client function |
| `translator.py` → `RunPodTranslator` | Yes (3 tests) | **C+** | Missing: HTTP error codes, response parsing edge cases, timeout value validation |
| `ingest_local.py` | No | **F** | Zero tests for PDF ingestion pipeline |

**Yellow Zone Score: 62% covered, 38% gaps**

### GREEN ZONE Coverage

| File / Function | Tests Exist | Coverage Grade | Gaps |
|----------------|-------------|---------------|------|
| `chat/page.tsx` | No | **F** | No render tests, no interaction tests |
| `admin/page.tsx` | No | **F** | No render tests |
| `page.tsx` (landing) | No | **F** | No render tests |
| `BloodWorkConfirm.tsx` | No | **F** | No render tests |
| `StarRating.tsx` | No | **F** | No render tests |
| `FeedbackModal.tsx` | No | **F** | No render tests |
| All config files | N/A | **N/A** | Validated by build process |

**Green Zone Score: 0% tested (build/lint pass is the only validation)**

---

## 2. Critical Gaps — RED ZONE Files Without Tests

These are the highest-priority items that must be fixed before any quality gate can be trusted.

### GAP R1: CORS Configuration (Severity: Critical)
**File:** `backend/app/main.py` lines 30-48
**Risk:** A single regex typo could open the API to all origins or block all legitimate requests.
**Required Tests:**
- Verify allowed origin gets `Access-Control-Allow-Origin` header
- Verify disallowed origin gets no CORS header
- Verify regex mode matches `*.vercel.app` but not `evil-vercel.app.attacker.com`
- Verify `ALLOWED_ORIGINS` env var overrides default regex

### GAP R2: Admin API Key Generation (Severity: Critical)
**File:** `backend/app/routers/admin.py` lines 12-19
**Risk:** Key generation from PIN hash is the auth foundation. If this produces empty or predictable keys, admin is wide open.
**Required Tests:**
- Verify generated key is always 32 characters
- Verify same PIN always produces same key (deterministic)
- Verify different PINs produce different keys
- Verify `ADMIN_API_KEY` env var overrides generated key

### GAP R3: AI Client Initialization (Severity: High)
**File:** `backend/app/routers/chat.py` lines 45-84
**Risk:** Module-level initialization means import failure crashes the entire router.
**Required Tests:**
- Verify partial initialization (e.g., Pinecone missing but Groq present)
- Verify complete initialization failure is caught
- Verify chat endpoint returns 503 when services not initialized

### GAP R4: Blood Work Endpoint Robustness (Severity: High)
**File:** `backend/app/main.py` lines 73-146
**Risk:** Processes user-uploaded medical documents. Failures here lose patient data.
**Required Tests:**
- Multi-page PDF extraction
- PDF with no extractable text (scanned image)
- LLM returning malformed JSON
- LLM returning empty results array
- Text truncation at 15000 chars boundary

---

## 3. Critical Gaps — YELLOW ZONE Missing Branch Coverage

### GAP Y1: Chat Endpoint Error Paths
- QC model returns `{"revised_response": ""}` (empty string)
- QC model returns `{"wrong_key": "text"}` (missing expected key)
- Draft model returns empty content
- Embedding API times out
- Pinecone query returns 0 matches

### GAP Y2: Translation Edge Cases
- Language code not in `SUPPORTED_LANGUAGES` map
- Translation produces text shorter than 5 chars (fallback path)
- Groq timeout during translation

### GAP Y3: Frontend API Layer
- `api.ts` has zero test coverage
- Network error handling not tested
- Response parsing for malformed JSON not tested

---

## 4. Test Inventory

### Existing Tests (75 total)

| Test File | Tests | Zone Coverage |
|-----------|-------|--------------|
| `test_health.py` | 3 | Green (health endpoints) |
| `test_admin.py` | 12 | Red (auth + PIN) |
| `test_chat.py` | 13 | Yellow (chat + reranker + translation + gaps) |
| `test_security.py` | 22 | Red + Yellow (sanitization + file upload + feedback + route uniqueness) |
| `test_utilities.py` | 25 | Yellow (save_log + reranker + languages + RunPod) |

### Tests Needed (estimated)

| Category | Est. Tests | Priority |
|----------|-----------|----------|
| Red Zone gaps (R1-R4) | ~15 | P0 |
| Yellow Zone gaps (Y1-Y3) | ~20 | P1 |
| Frontend render/snapshot tests | ~10 | P2 |
| Total new tests needed | **~45** | |

---

## 5. Quality Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Backend test count | 75 | ~120 |
| Red Zone branch coverage | ~58% | 95%+ |
| Yellow Zone branch coverage | ~62% | 90%+ |
| Green Zone test existence | 0% | Basic render tests |
| Frontend test count | 0 | ~10 |
| Median test execution time | 0.76s | <2s |
| Security-specific tests | 22 | 35+ |
