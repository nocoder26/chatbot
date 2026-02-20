# Scalability Plan — Izana AI

Assessment for 10x growth potential with modularization, testing infrastructure, and directory restructuring recommendations.

---

## 1. Modularization — Files to Split

### Critical Splits

| File | Lines | Problem | Proposed Split |
|------|-------|---------|----------------|
| `frontend/src/app/chat/page.tsx` | ~860 | Monolithic: chat logic, animations, feedback, bloodwork upload, translations all in one file | Split into `ChatHeader`, `MessageList`, `MessageBubble`, `ChatInput`, `BloodWorkUpload`, `FeedbackWidget` components |
| `frontend/src/app/admin/page.tsx` | ~520 | Dashboard, PIN entry, 4 tab contents, drill-down all in one | Split `PinEntry`, `KnowledgeGapsTab`, `DocumentUsageTab`, `FeedbackTab`, `UserAnalyticsTab` into separate components |
| `frontend/src/app/page.tsx` | ~400 | Onboarding (4 steps), login flow, all in one | Split `LanguageStep`, `RegistrationStep`, `SecurityStep`, `LoginFlow` into separate components |
| `frontend/src/lib/api.ts` | ~350 | All API functions in one file | Split by domain: `api/auth.ts`, `api/chat.ts`, `api/bloodwork.ts`, `api/admin.ts`, `api/profile.ts` |
| `backend-node/src/routes/admin.js` | ~170 | Growing: stats + analytics + drill-down | Split analytics into `routes/admin-analytics.js` |

### Recommended: Component Library

Extract reusable UI patterns into `frontend/src/components/ui/`:
- `Button.tsx` (primary, secondary, coral CTA variants)
- `Card.tsx` (white card with shadow)
- `Badge.tsx` (privacy badges, status badges)
- `LoadingSpinner.tsx`
- `ErrorBanner.tsx`

---

## 2. Testing Infrastructure

### Framework Choices

- **Frontend:** Vitest + React Testing Library + JSDOM
- **Backend:** Vitest + Supertest (for HTTP integration tests)
- **E2E:** Playwright (when needed for Red Zone validation)

### Test Sharding Strategy

```
# Vitest workspaces (vitest.workspace.ts at root)
export default [
  'frontend',
  'backend-node',
]
```

- **Parallel execution:** Frontend and backend tests run in parallel via workspaces
- **File-level parallelism:** Vitest runs test files in parallel by default
- **CI Sharding:** Split tests across CI jobs using `--shard=1/3`, `--shard=2/3`, etc.

### Coverage Targets

| Zone | Branch Coverage | Statement Coverage |
|------|-----------------|-------------------|
| Red | 90%+ | 95%+ |
| Yellow | 80%+ | 85%+ |
| Green | Snapshot pass | 70%+ |

---

## 3. Proposed Feature-Based Directory Structure

### Current (File-Type Based)
```
backend-node/src/
├── routes/       (all route files)
├── lib/          (all utility files)
├── middleware/    (auth middleware)
└── cron/         (scheduled jobs)
```

### Proposed (Feature-Based)
```
backend-node/src/
├── modules/
│   ├── auth/
│   │   ├── register.route.js
│   │   ├── login.route.js
│   │   ├── passkey.route.js
│   │   ├── auth.middleware.js
│   │   └── __tests__/
│   │       ├── register.test.js
│   │       ├── login.test.js
│   │       └── passkey.test.js
│   ├── chat/
│   │   ├── chat.route.js
│   │   ├── chat.service.js
│   │   └── __tests__/chat.test.js
│   ├── bloodwork/
│   │   ├── bloodwork.route.js
│   │   ├── bloodwork.service.js
│   │   └── __tests__/bloodwork.test.js
│   ├── profile/
│   │   ├── profile.route.js
│   │   └── __tests__/profile.test.js
│   └── admin/
│       ├── admin.route.js
│       ├── analytics.route.js
│       └── __tests__/admin.test.js
├── shared/
│   ├── prisma.js
│   ├── llm.js
│   ├── pinecone.js
│   └── usernames.js
├── cron/
│   └── privacyDeletion.js
└── index.js
```

### Frontend Restructuring
```
frontend/src/
├── modules/
│   ├── onboarding/
│   │   ├── LanguageStep.tsx
│   │   ├── RegistrationStep.tsx
│   │   ├── SecurityStep.tsx
│   │   ├── LoginFlow.tsx
│   │   └── OnboardingPage.tsx
│   ├── chat/
│   │   ├── ChatHeader.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── ChatInput.tsx
│   │   ├── BloodWorkUpload.tsx
│   │   ├── FeedbackWidget.tsx
│   │   └── ChatPage.tsx
│   ├── profile/
│   │   └── ProfilePage.tsx
│   └── admin/
│       ├── PinEntry.tsx
│       ├── tabs/
│       │   ├── KnowledgeGaps.tsx
│       │   ├── DocumentUsage.tsx
│       │   ├── UserFeedback.tsx
│       │   └── UserAnalytics.tsx
│       └── AdminPage.tsx
├── components/ui/
│   ├── Button.tsx
│   ├── Card.tsx
│   └── Badge.tsx
└── lib/
    ├── api/
    │   ├── auth.ts
    │   ├── chat.ts
    │   ├── bloodwork.ts
    │   ├── admin.ts
    │   └── profile.ts
    └── utils/
```

---

## 4. Growth Bottlenecks

| Bottleneck | Current | 10x Solution |
|-----------|---------|-------------|
| Database connections | Single Prisma client | Connection pooling (PgBouncer on Railway) |
| LLM rate limits | Single Groq key | Rate limiter middleware + multiple API key rotation |
| Pinecone write throughput | Fire-and-forget upserts | Batch upserts with queue (BullMQ or similar) |
| File uploads | In-memory multer (10MB) | Stream to S3/R2, process async |
| WebAuthn challenges | In-memory Map | Redis for distributed challenge storage |
| Admin analytics | Real-time queries on Postgres | Pre-computed aggregates with materialized views or cron |
