#!/usr/bin/env bash
set -e

echo "[ENTRYPOINT] Starting PocketBase, POC public API, and ttyd..."

# Basic info (no secrets)
echo "[ENTRYPOINT] PB_URL=${PB_URL:-not-set}"
echo "[ENTRYPOINT] PB_ADMIN_EMAIL=${PB_ADMIN_EMAIL:-not-set}"
echo "[ENTRYPOINT] TTYD_PORT=${TTYD_PORT:-7681}"
echo "[ENTRYPOINT] TTYD_CREDENTIALS set? $( [ -n "$TTYD_CREDENTIALS" ] && echo yes || echo no )"

# --- PocketBase ---
./pocketbase serve \
  --dir pb_data \
  --http 0.0.0.0:8090 &
PB_PID=$!
echo "[ENTRYPOINT] PocketBase PID: $PB_PID (port 8090, data /app/pb_data)"

# --- Public API via gunicorn ---
gunicorn \
  --bind 0.0.0.0:8000 \
  --workers 3 \
  poc_public_api:app &
API_PID=$!
echo "[ENTRYPOINT] Public API PID: $API_PID (port 8000)"

# --- ttyd shell ---
if [ -z "$TTYD_CREDENTIALS" ]; then
  echo "[ENTRYPOINT] ERROR: TTYD_CREDENTIALS is not set. Refusing to start ttyd without auth."
  kill "$PB_PID" "$API_PID" 2>/dev/null || true
  exit 1
fi

ttyd -p "${TTYD_PORT:-7681}" \
  --writable \
  -c "$TTYD_CREDENTIALS" \
  sh -l &
TTYD_PID=$!
echo "[ENTRYPOINT] ttyd PID: $TTYD_PID (port ${TTYD_PORT:-7681})"

# Wait until one of the services dies, then stop all
wait -n "$PB_PID" "$API_PID" "$TTYD_PID"
EXIT_CODE=$?
echo "[ENTRYPOINT] One of the services exited (code $EXIT_CODE), shutting down..."
kill "$PB_PID" "$API_PID" "$TTYD_PID" 2>/dev/null || true
exit "$EXIT_CODE"
