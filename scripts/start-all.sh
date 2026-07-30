#!/bin/bash
# Combined start: launches api-server + Vite + watchdog in a single bash
# invocation, all detached via setsid. Run this as ONE bash command — the
# script itself returns immediately, leaving all three processes as children
# of init (PID 1) via setsid, which is what keeps them alive across bash
# session teardowns in this sandbox.

set -e
cd /home/z/my-project/routing-sheet-app

# Load env
set -a
source .env
set +a

LOG_API=/tmp/api-server.log
LOG_VITE=/tmp/vite.log
LOG_WATCHDOG=/tmp/watchdog.log

# Locate vite binary
VITE_BIN=$(ls node_modules/.pnpm/vite@*/node_modules/vite/bin/vite.js 2>/dev/null | head -1)
if [ -z "$VITE_BIN" ]; then
  echo "ERROR: vite binary not found"
  exit 1
fi

# Soft-kill previous instances (PGlite needs graceful shutdown)
pkill -TERM -f "watchdog.sh" 2>/dev/null || true
pkill -TERM -f "tsx/dist/cli.mjs" 2>/dev/null || true
pkill -TERM -f "vite.js" 2>/dev/null || true
pkill -TERM -f "esbuild.*service" 2>/dev/null || true
sleep 3
# Force-kill anything still alive
pkill -9 -f "watchdog.sh" 2>/dev/null || true
pkill -9 -f "tsx/dist/cli.mjs" 2>/dev/null || true
pkill -9 -f "vite.js" 2>/dev/null || true
pkill -9 -f "esbuild.*service" 2>/dev/null || true
sleep 1

# Start api-server (detached via setsid + nohup + /dev/null stdio)
echo "Starting api-server..."
setsid nohup node_modules/.bin/tsx artifacts/api-server/src/index.ts </dev/null >$LOG_API 2>&1 &
disown 2>/dev/null || true

# Wait for api to bind
for i in $(seq 1 15); do
  if curl -sS -m 1 http://127.0.0.1:5000/api/healthz > /dev/null 2>&1; then
    echo "  ✓ API ready after ${i}s"
    break
  fi
  sleep 1
done

# Start Vite (detached)
echo "Starting Vite..."
PORT=3000 BASE_PATH=/ setsid nohup node "$VITE_BIN" \
  --config artifacts/routing-sheet/vite.config.ts \
  </dev/null >$LOG_VITE 2>&1 &
disown 2>/dev/null || true

for i in $(seq 1 10); do
  if curl -sS -m 1 http://127.0.0.1:3000/ > /dev/null 2>&1; then
    echo "  ✓ Vite ready after ${i}s"
    break
  fi
  sleep 1
done

# Start watchdog (detached) — restarts api-server if it dies
echo "Starting watchdog..."
setsid nohup bash scripts/watchdog-loop.sh </dev/null >$LOG_WATCHDOG 2>&1 &
disown 2>/dev/null || true

# Final health checks
echo ""
echo "=== Health checks ==="
curl -sS -m 3 http://127.0.0.1:5000/api/healthz > /dev/null && echo "✓ API on :5000" || echo "✗ API DOWN"
curl -sS -m 3 http://127.0.0.1:3000/ > /dev/null && echo "✓ Vite on :3000" || echo "✗ Vite DOWN"
curl -sS -m 3 http://localhost:81/api/healthz > /dev/null && echo "✓ Gateway :81 → :3000" || echo "✗ Gateway DOWN"

echo ""
echo "=== Procs ==="
ps -ef | grep -E "watchdog|tsx|vite" | grep -v grep | head -5

echo ""
echo "Demo login: admin@demo.ru / password123"
