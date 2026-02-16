#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Izana AI — Smart Quality Gate
# Runs the right tests based on which architecture zone was changed.
# Called by .husky/pre-push before every git push.
# ============================================================================

RESET='\033[0m'
BOLD='\033[1m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

header() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${RESET}"; }
pass()   { echo -e "${GREEN}✓ $1${RESET}"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail()   { echo -e "${RED}✗ $1${RESET}"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
skip()   { echo -e "${YELLOW}○ $1 (skipped)${RESET}"; SKIP_COUNT=$((SKIP_COUNT + 1)); }

# ── Detect changed files ────────────────────────────────────────────────────

header "QUALITY GATE — Detecting changes"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
MERGE_BASE=$(git merge-base HEAD "origin/${CURRENT_BRANCH}" 2>/dev/null || echo "HEAD~1")

CHANGED_FILES=$(git diff --name-only "$MERGE_BASE"..HEAD 2>/dev/null || git diff --name-only HEAD~1..HEAD 2>/dev/null || echo "")

if [ -z "$CHANGED_FILES" ]; then
    CHANGED_FILES=$(git diff --name-only --cached 2>/dev/null || echo "")
fi

if [ -z "$CHANGED_FILES" ]; then
    echo "No changed files detected. Quality gate passes."
    exit 0
fi

echo "Changed files:"
echo "$CHANGED_FILES" | sed 's/^/  /'

# ── Filter out docs/assets that never need tests ────────────────────────────

TESTABLE_FILES=""
while IFS= read -r file; do
    case "$file" in
        *.md|*.txt|*.png|*.ico|*.woff|*.gitkeep|*.gitignore|.railwayignore|CNAME)
            continue ;;
        backend/data/*)
            continue ;;
        *)
            TESTABLE_FILES="${TESTABLE_FILES}${file}"$'\n' ;;
    esac
done <<< "$CHANGED_FILES"

TESTABLE_FILES=$(echo "$TESTABLE_FILES" | sed '/^$/d')

if [ -z "$TESTABLE_FILES" ]; then
    echo -e "\n${GREEN}Only docs/assets changed. Quality gate passes.${RESET}"
    exit 0
fi

# ── Classify into zones ─────────────────────────────────────────────────────

ZONE="GREEN"

is_red() {
    local file="$1"
    case "$file" in
        backend/app/routers/admin.py) return 0 ;;
        backend/app/main.py)          return 0 ;;
        backend/.env.example)         return 0 ;;
        railway.json)                 return 0 ;;
        backend/nixpacks.toml)        return 0 ;;
        frontend/vercel.json)         return 0 ;;
    esac
    return 1
}

is_yellow() {
    local file="$1"
    case "$file" in
        backend/app/routers/chat.py)   return 0 ;;
        backend/app/services/*)        return 0 ;;
        backend/ingest_local.py)       return 0 ;;
        frontend/src/lib/api.ts)       return 0 ;;
        backend/requirements.txt)      return 0 ;;
        backend/requirements-dev.txt)  return 0 ;;
    esac
    return 1
}

while IFS= read -r file; do
    [ -z "$file" ] && continue
    if is_red "$file"; then
        ZONE="RED"
        break
    elif is_yellow "$file"; then
        [ "$ZONE" != "RED" ] && ZONE="YELLOW"
    fi
done <<< "$TESTABLE_FILES"

# Also check for Red content patterns in diffs
if [ "$ZONE" != "RED" ]; then
    DIFF_CONTENT=$(git diff "$MERGE_BASE"..HEAD -- '*.py' '*.ts' '*.tsx' 2>/dev/null || echo "")
    RED_PATTERNS="sanitize_input|verify_admin|verify_pin|ADMIN_API_KEY|ADMIN_PIN|ALLOWED_ORIGINS|allow_origin_regex|CORS"
    if echo "$DIFF_CONTENT" | grep -qE "$RED_PATTERNS" 2>/dev/null; then
        ZONE="RED"
    fi
fi

echo -e "\n${BOLD}Zone: ${ZONE}${RESET}"

# ── Check for backend changes ────────────────────────────────────────────────

BACKEND_CHANGED=false
FRONTEND_CHANGED=false

while IFS= read -r file; do
    [ -z "$file" ] && continue
    case "$file" in
        backend/*) BACKEND_CHANGED=true ;;
        frontend/*) FRONTEND_CHANGED=true ;;
    esac
done <<< "$TESTABLE_FILES"

# ── Execute based on zone ────────────────────────────────────────────────────

header "QUALITY GATE — Running checks (${ZONE} zone)"

run_backend_tests() {
    local label="$1"
    local args="$2"
    if command -v python3 &>/dev/null; then
        echo -e "  Running: pytest ${args}"
        if (cd backend && python3 -m pytest ${args} 2>&1); then
            pass "$label"
        else
            fail "$label"
        fi
    else
        skip "$label (python3 not found)"
    fi
}

run_frontend_lint() {
    if [ -d "frontend/node_modules" ]; then
        echo "  Running: next lint"
        if (cd frontend && npx next lint 2>&1); then
            pass "Frontend lint"
        else
            fail "Frontend lint"
        fi
    else
        skip "Frontend lint (node_modules not installed)"
    fi
}

run_frontend_build() {
    if [ -d "frontend/node_modules" ]; then
        echo "  Running: next build"
        if (cd frontend && npx next build 2>&1); then
            pass "Frontend build (TypeScript + compile)"
        else
            fail "Frontend build (TypeScript + compile)"
        fi
    else
        skip "Frontend build (node_modules not installed)"
    fi
}

case "$ZONE" in
    RED)
        echo -e "${RED}${BOLD}  RED ZONE — Full test suite + security${RESET}"
        run_backend_tests "Backend: ALL tests" "tests/ -v"
        run_frontend_lint
        run_frontend_build
        ;;
    YELLOW)
        echo -e "${YELLOW}${BOLD}  YELLOW ZONE — Backend tests + lint${RESET}"
        if [ "$BACKEND_CHANGED" = true ]; then
            run_backend_tests "Backend: ALL tests" "tests/ -v"
        else
            skip "Backend tests (no backend files changed)"
        fi
        run_frontend_lint
        if [ "$FRONTEND_CHANGED" = true ]; then
            run_frontend_build
        else
            skip "Frontend build (no frontend files changed)"
        fi
        ;;
    GREEN)
        echo -e "${GREEN}${BOLD}  GREEN ZONE — Lint + build only${RESET}"
        if [ "$BACKEND_CHANGED" = true ]; then
            run_backend_tests "Backend: quick tests" "tests/ -q"
        else
            skip "Backend tests (no backend files changed)"
        fi
        run_frontend_lint
        if [ "$FRONTEND_CHANGED" = true ]; then
            run_frontend_build
        else
            skip "Frontend build (no frontend files changed)"
        fi
        ;;
esac

# ── Summary ──────────────────────────────────────────────────────────────────

header "QUALITY GATE — Summary"
echo -e "  ${GREEN}Passed: ${PASS_COUNT}${RESET}"
echo -e "  ${YELLOW}Skipped: ${SKIP_COUNT}${RESET}"
echo -e "  ${RED}Failed: ${FAIL_COUNT}${RESET}"

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "\n${RED}${BOLD}QUALITY GATE FAILED — Push blocked.${RESET}"
    echo -e "${RED}Fix the failures above before pushing.${RESET}\n"
    exit 1
else
    echo -e "\n${GREEN}${BOLD}QUALITY GATE PASSED${RESET}\n"
    exit 0
fi
