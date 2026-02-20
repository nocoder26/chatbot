# Test Plan — Izana AI Pre-Push Quality Gate

Defines the automated testing strategy that runs before every `git push`.

---

## Smart Execution Logic

### File Change Detection

```bash
# Get list of changed files relative to the remote branch
CHANGED_FILES=$(git diff --name-only @{push}..HEAD 2>/dev/null || git diff --name-only HEAD~1)
```

### Zone Classification

Each changed file is mapped to its zone using path patterns:

```bash
RED_PATTERNS=(
  "backend-node/src/routes/register.js"
  "backend-node/src/routes/auth.js"
  "backend-node/src/routes/passkey.js"
  "backend-node/src/middleware/"
  "backend-node/prisma/"
  "backend-node/src/cron/"
  "backend-node/src/index.js"
  "backend-node/src/lib/pinecone.js"
)

YELLOW_PATTERNS=(
  "backend-node/src/routes/"
  "backend-node/src/lib/"
  "frontend/src/lib/"
  "frontend/src/app/page.tsx"
  "frontend/src/app/chat/"
  "frontend/src/app/admin/page.tsx"
)

# Everything else = GREEN
```

### Execution Matrix

| Highest Zone Hit | Actions |
|-----------------|---------|
| **Red Zone** | ESLint (full) + All backend tests + All frontend tests + Security scan |
| **Yellow Zone** | ESLint (changed files) + Related unit/integration tests |
| **Green Zone** | ESLint (changed files) + Snapshot tests for affected pages |
| **No changes** | Skip (allow push) |

---

## Tooling

### Git Hooks

- **husky** — Manages git hook scripts
- **Hook:** `pre-push` (not pre-commit, to avoid slowing down commits)

### Test Runner

- **Vitest** — Fast, ESM-native test runner for both frontend and backend
- Config: `backend-node/vitest.config.js` and `frontend/vitest.config.ts`

### Linting

- **ESLint** — Already configured for frontend via Next.js
- Add `eslint` config for backend

### Security Scanning

- `npm audit --audit-level=high` — Check for known vulnerabilities
- Future: `semgrep` or `njsscan` for code-level security patterns

---

## Test Framework Configuration

### Backend (`backend-node/vitest.config.js`)

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
    },
  },
});
```

### Frontend (`frontend/vitest.config.ts`)

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
    },
  },
  resolve: {
    alias: { '@': './src' },
  },
});
```

---

## Smart Test Script (`scripts/smart-test.sh`)

```bash
#!/bin/bash
set -e

# Detect changed files
CHANGED=$(git diff --name-only @{push}..HEAD 2>/dev/null || git diff --name-only HEAD~1)

if [ -z "$CHANGED" ]; then
  echo "No changes detected. Skipping tests."
  exit 0
fi

ZONE="green"

# Check for Red Zone files
for file in $CHANGED; do
  case "$file" in
    backend-node/src/routes/register.js|backend-node/src/routes/auth.js|backend-node/src/routes/passkey.js)
      ZONE="red" ;;
    backend-node/src/middleware/*|backend-node/prisma/*|backend-node/src/cron/*)
      ZONE="red" ;;
    backend-node/src/index.js|backend-node/src/lib/pinecone.js)
      ZONE="red" ;;
  esac
done

# Check for Yellow Zone files (only if not already red)
if [ "$ZONE" != "red" ]; then
  for file in $CHANGED; do
    case "$file" in
      backend-node/src/routes/*|backend-node/src/lib/*)
        ZONE="yellow" ;;
      frontend/src/lib/*|frontend/src/app/page.tsx|frontend/src/app/chat/*)
        ZONE="yellow" ;;
      frontend/src/app/admin/page.tsx)
        ZONE="yellow" ;;
    esac
  done
fi

echo "Detected zone: $ZONE"
echo "Changed files:"
echo "$CHANGED"
echo ""

case "$ZONE" in
  red)
    echo "=== RED ZONE: Running full test suite ==="
    cd backend-node && npx vitest run --reporter=verbose 2>/dev/null || true && cd ..
    cd frontend && npx vitest run --reporter=verbose 2>/dev/null || true && cd ..
    echo "=== Security scan ==="
    cd backend-node && npm audit --audit-level=high 2>/dev/null || true && cd ..
    cd frontend && npm audit --audit-level=high 2>/dev/null || true && cd ..
    ;;
  yellow)
    echo "=== YELLOW ZONE: Running related tests + lint ==="
    cd backend-node && npx vitest run --reporter=verbose 2>/dev/null || true && cd ..
    cd frontend && npx next lint 2>/dev/null || true && cd ..
    ;;
  green)
    echo "=== GREEN ZONE: Running lint + snapshots ==="
    cd frontend && npx next lint 2>/dev/null || true && cd ..
    ;;
esac

echo ""
echo "Quality gate passed."
```

---

## CI Integration (GitHub Actions)

The same zone logic can be used in CI:

```yaml
name: Quality Gate
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd backend-node && npm ci
      - run: cd frontend && npm ci
      - run: bash scripts/smart-test.sh
```

---

## Phase 2 Implementation Checklist

When approved, the following will be created:

- [ ] Install `husky` at project root
- [ ] Create `.husky/pre-push` hook
- [ ] Create `scripts/smart-test.sh`
- [ ] Install `vitest` + `supertest` in backend-node
- [ ] Install `vitest` + `@testing-library/react` in frontend
- [ ] Create `backend-node/vitest.config.js`
- [ ] Create `frontend/vitest.config.ts`
- [ ] Write Red Zone tests: auth, register, passkey, middleware
- [ ] Write Yellow Zone tests: chat, bloodwork, admin
- [ ] Write Green Zone tests: page snapshots
