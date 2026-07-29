#!/bin/bash
# Start script for routing-sheet app: launches API server (port 5000) and
# Vite dev server (port 3000). Both run detached via setsid+nohup and survive
# the originating shell session.

set -e
cd /home/z/my-project/routing-sheet-app

# Load env
set -a
source .env
set +a

# Locate vite binary inside pnpm's content-addressable store
VITE_BIN=$(ls node_modules/.pnpm/vite@*/node_modules/vite/bin/vite.js 2>/dev/null | head -1)
if [ -z "$VITE_BIN" ]; then
  echo "ERROR: vite binary not found in node_modules/.pnpm"
  exit 1
fi

# Kill any previous instances on these ports
for PORT in 3000 5000; do
  PID=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | head -1)
  if [ -n "$PID" ]; then
    echo "Killing existing process on port $PORT (pid $PID)"
    kill -9 "$PID" 2>/dev/null || true
  fi
done

# Start API server (tsx runs TypeScript directly — no esbuild bundle step needed)
echo "Starting API server on port 5000..."
setsid nohup node_modules/.bin/tsx artifacts/api-server/src/index.ts > /tmp/api-server.log 2>&1 &
API_PID=$!
echo "  PID: $API_PID, log: /tmp/api-server.log"

# Give the API server time to bind
sleep 4

# Start Vite dev server
echo "Starting Vite dev server on port 3000..."
PORT=3000 BASE_PATH=/ setsid nohup node "$VITE_BIN" --config artifacts/routing-sheet/vite.config.ts > /tmp/vite.log 2>&1 &
VITE_PID=$!
echo "  PID: $VITE_PID, log: /tmp/vite.log"

# Wait for Vite to be ready
sleep 4

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

echo ""
echo "=== Login test (admin@demo.ru / password123) ==="
LOGIN_RESP=$(curl -sS -m 5 -X POST http://127.0.0.1:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.ru","password":"password123"}')
echo "$LOGIN_RESP" | head -c 400
echo ""
