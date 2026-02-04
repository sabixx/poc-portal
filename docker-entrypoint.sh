#!/usr/bin/env sh
set -e

# Basic info (no secrets)
echo "[ENTRYPOINT] PB_URL=${PB_URL:-http://127.0.0.1:8090}"
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
# Make sure API_SHARED_SECRET always has a value, but DON'T execute it :)
API_SHARED_SECRET="${API_SHARED_SECRET:-defaultsecret}"
export API_SHARED_SECRET

echo "[ENTRYPOINT] API_SHARED_SECRET length: ${#API_SHARED_SECRET}"
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


# Graceful shutdown on SIGTERM/SIGINT
trap 'echo "[ENTRYPOINT] Caught signal, shutting down..."; \
      kill "$PB_PID" "$API_PID" "$TTYD_PID" 2>/dev/null || true; \
      exit 0' INT TERM

echo 'version 0.0.10'

# --- Monitor: exit when any child dies, then kill the rest ---
EXIT_CODE=0


while :; do
  # If any of the processes is gone, break and clean up
  if ! kill -0 "$PB_PID" 2>/dev/null; then
    echo "[ENTRYPOINT] PocketBase exited, shutting down..."
    EXIT_CODE=1
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "[ENTRYPOINT] Public API exited, shutting down..."
    EXIT_CODE=1
    break
  fi
  if ! kill -0 "$TTYD_PID" 2>/dev/null; then
    echo "[ENTRYPOINT] ttyd exited, shutting down..."
    EXIT_CODE=1
    break
  fi
  sleep 2
done

kill "$PB_PID" "$API_PID" "$TTYD_PID" 2>/dev/null || true
echo "[ENTRYPOINT] One of the services exited, container stopping with code $EXIT_CODE"
exit "$EXIT_CODE"