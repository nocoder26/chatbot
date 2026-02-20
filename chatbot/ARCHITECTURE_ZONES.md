# Architecture Zones — Izana AI

Risk-based classification of the codebase for automated testing and AI editing policies.

---

## Red Zone (Critical / High Risk)

**Policy:** Human-in-the-loop mandatory. Heavy integration/E2E testing, security auditing.

| File | Reason |
|------|--------|
| `backend-node/src/routes/register.js` | User registration, passphrase hashing, JWT issuance |
| `backend-node/src/routes/auth.js` | Login flow, passphrase verification, JWT issuance |
| `backend-node/src/routes/passkey.js` | WebAuthn credential lifecycle, challenge/response |
| `backend-node/src/middleware/auth.js` | JWT verification middleware — gates all protected routes |
| `backend-node/prisma/schema.prisma` | Database schema — changes cascade to every feature |
| `backend-node/src/cron/privacyDeletion.js` | 24-hour data deletion — must not lose data prematurely or retain too long |
| `backend-node/src/index.js` | CORS configuration, route mounting, Express setup |
| `backend-node/src/lib/pinecone.js` | Pinecone vectorization — handles data export before privacy deletion |

---

## Yellow Zone (Medium Risk)

**Policy:** AI edits require review. 100% branch coverage, strict typing, integration tests with mocks.

| File | Reason |
|------|--------|
| `backend-node/src/routes/chat.js` | Core chat logic, LLM integration, message persistence |
| `backend-node/src/routes/bloodwork.js` | PDF parsing, AI analysis, BloodWorkReport creation |
| `backend-node/src/routes/profile.js` | User data retrieval, chat deletion |
| `backend-node/src/routes/admin.js` | Admin analytics endpoints, data aggregation |
| `backend-node/src/lib/llm.js` | Groq LLM client — streaming and non-streaming responses |
| `frontend/src/lib/api.ts` | All API call functions — single point of failure for frontend-backend communication |
| `frontend/src/app/page.tsx` | Onboarding flow with auth (passkey/passphrase registration + login) |
| `frontend/src/app/chat/page.tsx` | Chat UI, message handling, blood work upload flow |
| `frontend/src/app/admin/page.tsx` | Admin dashboard with all tabs including User Analytics |

---

## Green Zone (High Velocity / Low Risk)

**Policy:** AI can edit freely. Snapshot and basic render tests.

| File | Reason |
|------|--------|
| `frontend/tailwind.config.ts` | Tailwind theme configuration |
| `frontend/src/app/globals.css` | Global CSS variables and styles |
| `frontend/src/app/layout.tsx` | Root layout wrapper |
| `frontend/src/app/profile/page.tsx` | Profile display (read-only data presentation) |
| `frontend/src/app/admin/lab-reviews/page.tsx` | Static knowledge gaps table view |
| `frontend/src/components/BloodWorkConfirm.tsx` | UI component for blood work confirmation modal |
| `backend-node/src/lib/usernames.js` | Username generation utility |
| `frontend/public/*` | Static assets (logo, favicon, etc.) |

---

## Zone Map (Visual)

```
backend-node/
├── prisma/schema.prisma           [RED]
├── src/
│   ├── index.js                   [RED]
│   ├── middleware/auth.js          [RED]
│   ├── routes/
│   │   ├── register.js            [RED]
│   │   ├── auth.js                [RED]
│   │   ├── passkey.js             [RED]
│   │   ├── chat.js                [YELLOW]
│   │   ├── bloodwork.js           [YELLOW]
│   │   ├── profile.js             [YELLOW]
│   │   └── admin.js               [YELLOW]
│   ├── lib/
│   │   ├── llm.js                 [YELLOW]
│   │   ├── pinecone.js            [RED]
│   │   ├── prisma.js              [YELLOW]
│   │   └── usernames.js           [GREEN]
│   └── cron/privacyDeletion.js    [RED]

frontend/
├── tailwind.config.ts             [GREEN]
├── src/
│   ├── app/
│   │   ├── globals.css            [GREEN]
│   │   ├── layout.tsx             [GREEN]
│   │   ├── page.tsx               [YELLOW]
│   │   ├── chat/page.tsx          [YELLOW]
│   │   ├── profile/page.tsx       [GREEN]
│   │   ├── admin/page.tsx         [YELLOW]
│   │   └── admin/lab-reviews/     [GREEN]
│   ├── lib/api.ts                 [YELLOW]
│   └── components/                [GREEN]
```
