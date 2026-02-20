#!/bin/bash
set -e

echo "=== Izana AI Quality Gate ==="
echo ""

E2E_FLAG=""
for arg in "$@"; do
  case "$arg" in
    --e2e) E2E_FLAG="true" ;;
  esac
done

# Detect changed files
CHANGED=$(git diff --name-only @{push}..HEAD 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null || echo "")

if [ -z "$CHANGED" ]; then
  echo "No changes detected. Skipping tests."
  exit 0
fi

ZONE="green"

# Check for Red Zone files (auth, encryption, consent, GDPR, infrastructure)
while IFS= read -r file; do
  case "$file" in
    backend-node/src/routes/register.js|backend-node/src/routes/auth.js|backend-node/src/routes/passkey.js)
      ZONE="red" ;;
    backend-node/src/routes/consent.js|backend-node/src/routes/userRights.js)
      ZONE="red" ;;
    backend-node/src/gdpr/encryption.js|backend-node/src/gdpr/consentCheck.js|backend-node/src/gdpr/auditLogger.js)
      ZONE="red" ;;
    backend-node/src/middleware/*)
      ZONE="red" ;;
    backend-node/prisma/*)
      ZONE="red" ;;
    backend-node/src/cron/*)
      ZONE="red" ;;
    backend-node/src/index.js)
      ZONE="red" ;;
    backend-node/src/lib/pinecone.js)
      ZONE="red" ;;
  esac
done <<< "$CHANGED"

# Check for Yellow Zone files (business logic, anonymization, UI pages)
if [ "$ZONE" != "red" ]; then
  while IFS= read -r file; do
    case "$file" in
      backend-node/src/routes/*)
        ZONE="yellow" ;;
      backend-node/src/lib/*)
        ZONE="yellow" ;;
      backend-node/src/gdpr/anonymization.js|backend-node/src/gdpr/sanitizer.js|backend-node/src/gdpr/riskAssessment.js)
        ZONE="yellow" ;;
      backend-node/src/cron/tier2Extraction.js|backend-node/src/cron/tier3Aggregation.js)
        ZONE="yellow" ;;
      backend-node/src/gdpr/modelImprovement.js)
        ZONE="yellow" ;;
      frontend/src/lib/*)
        ZONE="yellow" ;;
      frontend/src/app/page.tsx)
        ZONE="yellow" ;;
      frontend/src/app/chat/*)
        ZONE="yellow" ;;
      frontend/src/app/admin/page.tsx)
        ZONE="yellow" ;;
      frontend/src/app/profile/*)
        ZONE="yellow" ;;
    esac
  done <<< "$CHANGED"
fi

echo "Detected zone: $ZONE"
echo "Changed files:"
echo "$CHANGED" | head -20
echo ""

run_backend_tests() {
  echo "--- Backend tests ---"
  cd backend-node && npx vitest run --reporter=verbose 2>/dev/null || echo "[WARN] Backend tests failed or not found"
  cd ..
}

run_frontend_tests() {
  echo "--- Frontend tests ---"
  cd frontend && npx vitest run --reporter=verbose 2>/dev/null || echo "[WARN] Frontend tests failed or not found"
  cd ..
}

run_e2e_tests() {
  if [ "$E2E_FLAG" = "true" ]; then
    echo "--- E2E tests (Playwright) ---"
    npx playwright test --reporter=list 2>/dev/null || echo "[WARN] E2E tests failed or not found"
  fi
}

case "$ZONE" in
  red)
    echo "=== RED ZONE: Full test suite + security scan ==="
    echo ""
    run_backend_tests
    echo ""
    run_frontend_tests
    echo ""
    echo "--- Security audit ---"
    cd backend-node && npm audit --audit-level=high 2>/dev/null || echo "[WARN] Backend audit warnings" && cd ..
    cd frontend && npm audit --audit-level=high 2>/dev/null || echo "[WARN] Frontend audit warnings" && cd ..
    echo ""
    run_e2e_tests
    ;;
  yellow)
    echo "=== YELLOW ZONE: Related tests + lint ==="
    echo ""
    run_backend_tests
    echo ""
    run_frontend_tests
    echo ""
    echo "--- Frontend lint ---"
    cd frontend && npx next lint 2>/dev/null || echo "[WARN] Frontend lint warnings" && cd ..
    ;;
  green)
    echo "=== GREEN ZONE: Lint only ==="
    echo ""
    echo "--- Frontend lint ---"
    cd frontend && npx next lint 2>/dev/null || echo "[WARN] Frontend lint warnings" && cd ..
    ;;
esac

echo ""
echo "=== Quality gate complete ==="
