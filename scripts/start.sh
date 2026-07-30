#!/bin/bash
# Robust start script — survives the parent bash session.
# Uses setsid + complete stdio detach so the process truly becomes a daemon.
set -e
cd /home/z/my-project/routing-sheet-app

# Load env
set -a
source .env
set +a

# Kill any previous instances on these ports (soft kill for PGlite safety)
for PORT in 3000 5000; do
  PID=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | head -1)
  if [ -n "$PID" ]; then
    # Try SIGTERM first, give PGlite time to flush, then SIGKILL if needed
    kill -TERM "$PID" 2>/dev/null || true
    for i in 1 2 3 4 5; do
      if ! kill -0 "$PID" 2>/dev/null; then break; fi
      sleep 1
    done
    kill -9 "$PID" 2>/dev/null || true
  fi
done

# Also kill orphan tsx/esbuild processes from previous runs
pkill -TERM -f "tsx/dist/cli.mjs" 2>/dev/null || true
pkill -TERM -f "vite.js" 2>/dev/null || true
sleep 2

# Locate vite binary inside pnpm's content-addressable store
VITE_BIN=$(ls node_modules/.pnpm/vite@*/node_modules/vite/bin/vite.js 2>/dev/null | head -1)
if [ -z "$VITE_BIN" ]; then
  echo "ERROR: vite binary not found in node_modules/.pnpm"
  exit 1
fi

# Start API server — fully detached via setsid + /dev/null stdio + nohup
echo "Starting API server on port 5000..."
setsid nohup node_modules/.bin/tsx artifacts/api-server/src/index.ts \
  </dev/null >/tmp/api-server.log 2>&1 &
disown $! 2>/dev/null || true
API_PID=$!
echo "  PID: $API_PID, log: /tmp/api-server.log"

# Wait for API server to bind (up to 15 seconds)
for i in $(seq 1 15); do
  if curl -sS -m 1 http://127.0.0.1:5000/api/healthz > /dev/null 2>&1; then
    echo "  ✓ API server ready after ${i}s"
    break
  fi
  sleep 1
done

# Start Vite dev server — fully detached
echo "Starting Vite dev server on port 3000..."
PORT=3000 BASE_PATH=/ setsid nohup node "$VITE_BIN" \
  --config artifacts/routing-sheet/vite.config.ts \
  </dev/null >/tmp/vite.log 2>&1 &
disown $! 2>/dev/null || true
VITE_PID=$!
echo "  PID: $VITE_PID, log: /tmp/vite.log"

# Wait for Vite to bind
for i in $(seq 1 10); do
  if curl -sS -m 1 http://127.0.0.1:3000/ > /dev/null 2>&1; then
    echo "  ✓ Vite ready after ${i}s"
    break
  fi
  sleep 1
done

# Health checks
echo ""
echo "=== Health checks ==="
if curl -sS -m 3 http://127.0.0.1:5000/api/healthz | grep -q ok; then
  echo "✓ API server healthy on :5000"
else
  echo "✗ API server NOT responding on :5000 — see /tmp/api-server.log"
fi

if curl -sS -m 3 http://127.0.0.1:3000/ > /dev/null; then
  echo "✓ Vite dev server responding on :3000"
else
  echo "✗ Vite dev server NOT responding on :3000 — see /tmp/vite.log"
fi

if curl -sS -m 3 http://127.0.0.1:3000/api/healthz | grep -q ok; then
  echo "✓ /api proxy from :3000 → :5000 working"
fi

# Verify the new status endpoints return cabinet + instructions
echo ""
echo "=== Smoke test: candidate-status API returns cabinet + instructions ==="
TOKEN=$(DATABASE_URL="$DATABASE_URL" node_modules/.bin/tsx -r artifacts/api-server/scripts/_get-token.mjs 2>/dev/null | tail -1 || true)
if [ -n "$TOKEN" ] && [ "$TOKEN" != "" ]; then
  RESP=$(curl -sS -m 5 "http://127.0.0.1:5000/api/candidate-status/$TOKEN")
  if echo "$RESP" | grep -q '"cabinet"' && echo "$RESP" | grep -q '"instructions"'; then
    echo "✓ Candidate status includes cabinet + instructions"
    echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print('  First step:', d['steps'][0]['label'], '→', d['steps'][0]['cabinet'])"
  else
    echo "✗ Candidate status response missing cabinet/instructions"
    echo "  Response: $RESP" | head -c 300
  fi
else
  echo "(skipped — no token available)"
fi

echo ""
echo "Demo login: admin@demo.ru / password123"
