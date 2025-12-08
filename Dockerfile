FROM python:3.12-slim

# Build-time arch from Docker (linux/amd64, linux/arm64, ...)
ARG TARGETARCH

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# System deps: certs, curl, bash
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        bash \
    && rm -rf /var/lib/apt/lists/*

# --- Python deps ---
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# --- App files (PocketBase + API + pb_data seed) ---
COPY . .

# --- Install ttyd binary from GitHub releases ---
# Uses TARGETARCH to choose the right binary:
#   amd64  -> ttyd.x86_64
#   arm64  -> ttyd.aarch64
RUN set -eux; \
    case "$TARGETARCH" in \
      amd64) TTYD_TARGET="x86_64" ;; \
      arm64) TTYD_TARGET="aarch64" ;; \
      *) echo "Unsupported TARGETARCH=$TARGETARCH"; exit 1 ;; \
    esac; \
    TTYD_VERSION="1.7.7"; \
    TTYD_URL="https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${TTYD_TARGET}"; \
    echo "Downloading ttyd from $TTYD_URL"; \
    curl -fsSL "$TTYD_URL" -o /usr/local/bin/ttyd; \
    chmod +x /usr/local/bin/ttyd

# Persistent volume for PocketBase data
VOLUME ["/app/pb_data"]

# Ports inside container:
#  - 8090 = PocketBase
#  - 8000 = public API (gunicorn)
#  - 7681 = ttyd
EXPOSE 8090 8000 7681

# Default (non-secret) env; real secrets come from ECS or docker run
ENV PB_URL="http://127.0.0.1:8090"
ENV TTYD_PORT=7681

ENTRYPOINT ["/app/docker-entrypoint.sh"]
