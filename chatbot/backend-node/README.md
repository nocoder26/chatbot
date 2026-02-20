# Izana Node.js Backend

Express + Prisma backend with JWT auth and streaming chat.

## Setup

1. Copy `.env.example` to `.env` and fill in values.
2. Install dependencies: `npm install`
3. Generate Prisma client: `npm run db:generate`
4. Push schema to DB: `npm run db:push` (or `npm run db:migrate` for migrations)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for JWT signing (min 32 chars) |
| `GROQ_API_KEY` | Groq API key for LLM |
| `LLM_MODEL` | Model name (default: llama-3.3-70b-versatile) |

## Endpoints

- **POST /api/auth/register** – `{ username, avatarUrl? }` → create anonymous user, return JWT + user
- **POST /api/chat** – `Authorization: Bearer <JWT>`, `{ message, chatId?, title? }` → stream LLM response

## Cron

- **0 * * * *** – Deletes `Chat`, `Message`, and `User` records older than 24 hours
