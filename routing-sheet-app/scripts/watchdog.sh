#!/bin/bash
# Watchdog for the api-server — restarts it if it dies.
# This is the reliable way to keep the server alive across bash sessions:
# the watchdog itself runs detached (setsid + nohup), and polls every 5s.
# If api-server is not responding on :5000, it starts a new instance.

set -e
cd /home/z/my-project/routing-sheet-app

# Load env
set -a
source .env
set +a

LOG=/tmp/api-server.log
PIDFILE=/tmp/api-server.pid

# Kill any previous instances (soft kill for PGlite)
echo "[$(date +%H:%M:%S)] Watchdog: cleaning up previous api-server instances..."
pkill -TERM -f "tsx/dist/cli.mjs" 2>/dev/null || true
sleep 2
pkill -9 -f "tsx/dist/cli.mjs" 2>/dev/null || true

start_api() {
  echo "[$(date +%H:%M:%S)] Watchdog: starting api-server..."
  setsid nohup node_modules/.bin/tsx artifacts/api-server/src/index.ts </dev/null >>$LOG 2>&1 &
  echo $! > $PIDFILE
  disown 2>/dev/null || true
}

# First start
start_api

# Wait for first readiness
for i in $(seq 1 15); do
  if curl -sS -m 1 http://127.0.0.1:5000/api/healthz > /dev/null 2>&1; then
    echo "[$(date +%H:%M:%S)] Watchdog: api-server is up (after ${i}s)"
    break
  fi
  sleep 1
done

# Poll loop — every 10s, check health; if down for 3 consecutive checks, restart
FAIL_COUNT=0
while true; do
  sleep 10
  if curl -sS -m 2 http://127.0.0.1:5000/api/healthz > /dev/null 2>&1; then
    FAIL_COUNT=0
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "[$(date +%H:%M:%S)] Watchdog: api-server not responding (fail #$FAIL_COUNT)"
    if [ $FAIL_COUNT -ge 2 ]; then
      echo "[$(date +%H:%M:%S)] Watchdog: restarting api-server..."
      pkill -9 -f "tsx/dist/cli.mjs" 2>/dev/null || true
      sleep 2
      start_api
      # Wait for readiness
      for i in $(seq 1 15); do
        if curl -sS -m 1 http://127.0.0.1:5000/api/healthz > /dev/null 2>&1; then
          echo "[$(date +%H:%M:%S)] Watchdog: api-server is back up (after ${i}s)"
          FAIL_COUNT=0
          break
        fi
        sleep 1
      done
    fi
  fi
done
