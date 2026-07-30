#!/bin/bash
# Watchdog loop — runs forever, checks api-server every 10s, restarts if down.
# Designed to be launched detached via setsid+nohup from start-all.sh.

cd /home/z/my-project/routing-sheet-app
set -a
source .env
set +a

LOG=/tmp/api-server.log

while true; do
  if ! curl -sS -m 2 http://127.0.0.1:5000/api/healthz > /dev/null 2>&1; then
    echo "[$(date +%H:%M:%S)] Watchdog: api-server not responding, restarting..."
    pkill -9 -f "tsx/dist/cli.mjs" 2>/dev/null || true
    sleep 2
    setsid nohup node_modules/.bin/tsx artifacts/api-server/src/index.ts </dev/null >>$LOG 2>&1 &
    disown 2>/dev/null || true
    # Wait for readiness
    for i in $(seq 1 15); do
      if curl -sS -m 1 http://127.0.0.1:5000/api/healthz > /dev/null 2>&1; then
        echo "[$(date +%H:%M:%S)] Watchdog: api-server back up after ${i}s"
        break
      fi
      sleep 1
    done
  fi
  sleep 10
done
