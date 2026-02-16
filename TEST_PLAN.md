# Test Plan — Automated Pre-Push Quality Gate

> Izana AI Codebase | `working-base-version` baseline

---

## 1. Quality Gate Architecture

```
Developer runs: git push
         │
         ▼
   ┌─────────────┐
   │  Pre-Push    │  ← husky git hook
   │  Hook        │
   └──────┬──────┘
          │
          ▼
   ┌─────────────────────┐
   │  scripts/            │
   │  smart-test.sh       │  ← Detects changed files, classifies by zone
   └──────┬──────────────┘
          │
          ├── Detect changed files (git diff)
          ├── Classify into zones (Red / Yellow / Green)
          │
          ▼
   ┌──────────────────────────────────────────────────┐
   │               EXECUTION MATRIX                     │
   │                                                    │
   │  RED ZONE changed?                                 │
   │  ├── YES → Run ALL backend tests                   │
   │  │         Run security tests                      │
   │  │         Run frontend build                      │
   │  │         Run lint                                │
   │  │                                                 │
   │  YELLOW ZONE changed?                              │
   │  ├── YES → Run related backend tests               │
   │  │         Run frontend build (if api.ts changed)  │
   │  │         Run lint                                │
   │  │                                                 │
   │  GREEN ZONE changed?                               │
   │  ├── YES → Run lint                                │
   │  │         Run frontend build                      │
   │  │                                                 │
   │  NOTHING changed (or only docs)?                   │
   │  └── SKIP → Push proceeds                          │
   └──────────────────────────────────────────────────┘
          │
          ▼
   ┌─────────────┐
   │  Gate Result │
   │  PASS → push │
   │  FAIL → block│
   └─────────────┘
```

---

## 2. File Classification Rules

### Zone Detection Patterns

```bash
# RED ZONE — any match triggers full security suite
RED_PATTERNS=(
  "backend/app/routers/admin.py"
  "backend/app/main.py"              # Contains CORS + rate limiter
  "backend/.env.example"
  "railway.json"
  "backend/nixpacks.toml"
  "frontend/vercel.json"
)

# Also RED if these functions/patterns are modified in any file:
RED_CONTENT_PATTERNS=(
  "sanitize_input"
  "verify_admin"
  "verify_pin"
  "ADMIN_API_KEY"
  "ADMIN_PIN"
  "ALLOWED_ORIGINS"
  "CORS"
  "allow_origin"
)

# YELLOW ZONE — business logic
YELLOW_PATTERNS=(
  "backend/app/routers/chat.py"
  "backend/app/services/"
  "backend/ingest_local.py"
  "frontend/src/lib/api.ts"
)

# GREEN ZONE — everything else in src/
GREEN_PATTERNS=(
  "frontend/src/app/"
  "frontend/src/components/"
  "frontend/tailwind.config.ts"
  "frontend/next.config.mjs"
  "frontend/postcss.config.mjs"
)

# SKIP — never trigger tests
SKIP_PATTERNS=(
  "*.md"
  "*.txt"
  ".gitignore"
  "AUDIT.md"
  "DEPLOY.md"
  "*.png"
  "*.ico"
  "*.woff"
)
```

---

## 3. Smart Execution Logic

### Pseudocode

```
function smart_test():
    changed_files = git diff --name-only origin/$(current_branch)..HEAD

    # Filter out skip patterns
    changed_files = filter_out(changed_files, SKIP_PATTERNS)

    if changed_files is empty:
        print("No testable files changed. Skipping quality gate.")
        exit 0

    zone = classify(changed_files)  # Returns highest zone: RED > YELLOW > GREEN

    if zone == RED:
        run: pytest backend/tests/ -v                    # ALL backend tests
        run: next lint                                    # Frontend lint
        run: next build                                   # Frontend type check + build
        # Future: run: bandit -r backend/app/             # Security static analysis

    elif zone == YELLOW:
        run: pytest backend/tests/ -v -k "not test_cors"  # Backend tests (skip heavy security)
        if "api.ts" in changed_files:
            run: next build                               # Frontend build
        run: next lint                                    # Frontend lint

    elif zone == GREEN:
        run: next lint                                    # Frontend lint
        run: next build                                   # Frontend type check + build

    if any_run_failed:
        print("QUALITY GATE FAILED")
        exit 1
    else:
        print("QUALITY GATE PASSED")
        exit 0
```

---

## 4. Tooling Setup

### 4.1 Git Hooks with Husky

```
# Root package.json (new — monorepo coordinator)
{
  "private": true,
  "scripts": {
    "prepare": "husky",
    "test:backend": "cd backend && python3 -m pytest tests/ -v",
    "test:backend:security": "cd backend && python3 -m pytest tests/ -v -k 'security or admin or cors'",
    "lint:frontend": "cd frontend && npx next lint",
    "build:frontend": "cd frontend && npx next build",
    "quality-gate": "bash scripts/smart-test.sh"
  },
  "devDependencies": {
    "husky": "^9"
  }
}
```

### 4.2 Husky Pre-Push Hook

```bash
# .husky/pre-push
bash scripts/smart-test.sh
```

### 4.3 Smart Test Script

The `scripts/smart-test.sh` script implements the zone detection and execution matrix described above. It:

1. Reads `git diff` to find changed files
2. Classifies changes into the highest applicable zone
3. Runs the appropriate test suite
4. Exits non-zero on any failure (blocking the push)

---

## 5. Execution Time Budgets

| Scenario | Tests Run | Target Time |
|----------|-----------|-------------|
| Green Zone only (UI change) | lint + build | ~12s |
| Yellow Zone (chat.py change) | 75 pytest + lint | ~14s |
| Red Zone (admin.py change) | 75 pytest + lint + build | ~24s |
| Docs only (README change) | Skip | 0s |

---

## 6. Future Enhancements (Phase 3+)

| Enhancement | Benefit |
|-------------|---------|
| `pytest-cov` with minimum coverage thresholds | Prevent coverage regression |
| `bandit` security scanner for Red Zone | Catch hardcoded secrets, SQL injection patterns |
| `lint-staged` for frontend (Prettier + ESLint on staged files) | Faster than full lint |
| GitHub Actions mirroring the pre-push gate | Catch issues from commits that bypass hooks |
| Playwright E2E tests | Full browser flow testing for chat + admin |
| Test impact analysis via `pytest --co` | Only run tests that import changed modules |

---

## 7. Implementation Checklist (Phase 2)

When approved, the implementation will:

- [ ] Create root `package.json` with husky
- [ ] Install and initialize husky
- [ ] Create `scripts/smart-test.sh` with zone detection logic
- [ ] Configure `.husky/pre-push` hook
- [ ] Write the ~15 critical Red Zone tests from QA_AUDIT.md gaps R1-R4
- [ ] Write the ~20 Yellow Zone branch coverage tests from gaps Y1-Y3
- [ ] Verify the quality gate blocks pushes on test failure
- [ ] Verify the quality gate skips on docs-only changes
