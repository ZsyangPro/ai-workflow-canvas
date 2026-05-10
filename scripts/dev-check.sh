#!/bin/bash
# Pre-development health check
# Run from project root: ./scripts/dev-check.sh
set -e
cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✅${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠️${NC} $1"; }
fail() { echo -e "  ${RED}❌${NC} $1"; }

echo "=== dev-check $(date +%H:%M:%S) ==="

# 1. Port check
echo "[ports]"
STALE=""
for port in 3000 5173; do
  PID=$(lsof -i :$port -t 2>/dev/null | head -1)
  if [ -n "$PID" ]; then
    CMD=$(ps -p $PID -o comm= 2>/dev/null || echo "unknown")
    warn "port $port in use by PID $PID ($CMD)"
    STALE="$STALE $PID"
  else
    pass "port $port free"
  fi
done
if [ -n "$STALE" ]; then
  echo "  → run: kill$STALE 2>/dev/null"
fi

# 2. DB connectivity
echo "[database]"
if [ -f server/.env ]; then
  if (cd server && npx tsx -e "
    const { PrismaClient } = require('@prisma/client');
    new PrismaClient().\$queryRaw\`SELECT 1\`.then(() => process.exit(0)).catch(() => process.exit(1));
  " 2>/dev/null); then
    pass "database reachable"
  else
    fail "database unreachable — check DATABASE_URL in server/.env"
  fi
else
  warn "server/.env not found, skipping DB check"
fi

# 3. Dependencies
echo "[deps]"
for dir in server ai-workflow-canvas-vue; do
  if [ -d "$dir/node_modules" ]; then
    pass "$dir node_modules exists"
  else
    fail "$dir node_modules missing — run: cd $dir && npm install"
  fi
done

# 4. TypeScript compilation
echo "[types]"
if (cd server && npx tsc --noEmit 2>/dev/null); then
  pass "server tsc"
else
  fail "server tsc — run: cd server && npx tsc --noEmit"
fi
if (cd ai-workflow-canvas-vue && npx vue-tsc --noEmit 2>/dev/null); then
  pass "frontend vue-tsc"
else
  fail "frontend vue-tsc — run: cd ai-workflow-canvas-vue && npx vue-tsc --noEmit"
fi

# 5. Tests (quick — only if DB is up)
echo "[tests]"
if (cd server && npx vitest run --reporter=verbose 2>&1 | tail -3); then
  pass "tests passing"
else
  warn "tests failed or skipped — run: cd server && npm test"
fi

# 6. Stale processes
echo "[cleanup]"
OLD_TSX=$(ps aux | grep "tsx.*index.ts" | grep -v grep | wc -l | tr -d ' ')
OLD_VITE=$(ps aux | grep "vite" | grep -v grep | wc -l | tr -d ' ')
if [ "$OLD_TSX" -gt 0 ] || [ "$OLD_VITE" -gt 0 ]; then
  warn "found $OLD_TSX tsx / $OLD_VITE vite processes — run: pkill -f 'tsx.*index.ts|vite' && sleep 2"
else
  pass "no stale processes"
fi

echo "=== done ==="
