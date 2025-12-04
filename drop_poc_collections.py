#!/usr/bin/env python3
"""
Drop selected PocketBase collections via API.

⚠️ This deletes the COLLECTION (schema + data)!
Use only if you can recreate these collections from your setup process.

Env vars:
    PB_URL             (default: http://127.0.0.1:8090)
    PB_ADMIN_EMAIL
    PB_ADMIN_PASSWORD

Usage:
    export PB_URL="http://127.0.0.1:8090"
    export PB_ADMIN_EMAIL="admin@example.com"
    export PB_ADMIN_PASSWORD="supersecret"

    python drop_poc_collections.py
"""

import os
import sys
import requests

PB_URL = os.environ.get("PB_URL", "http://127.0.0.1:8090")
PB_ADMIN_EMAIL = os.environ.get("PB_ADMIN_EMAIL")
PB_ADMIN_PASSWORD = os.environ.get("PB_ADMIN_PASSWORD")

# 👉 Adjust this to exactly the collections you want to DROP
TARGET_COLLECTION_NAMES = {
    "pocs",
    "poc_use_cases",
    "comments",
    "use_cases",
    "feature_requests",
    "poc_feature_requests",
    "ae_se_map",
    "manager_se_map"
          # or "poc_comments" etc.
    # "poc_feedback",
    # "poc_questions",
}

SESSION = requests.Session()
SESSION.headers["Content-Type"] = "application/json"


def log(msg: str) -> None:
    print(f"[DROP] {msg}", flush=True)


def require_env(var: str) -> str:
    val = os.environ.get(var)
    if not val:
        log(f"ERROR: environment variable {var} is not set.")
        sys.exit(1)
    return val


def admin_login() -> None:
    url = f"{PB_URL.rstrip('/')}/api/collections/_superusers/auth-with-password"
    payload = {
        "identity": PB_ADMIN_EMAIL,
        "password": PB_ADMIN_PASSWORD,
    }
    log(f"Logging in as admin {PB_ADMIN_EMAIL} …")
    resp = SESSION.post(url, json=payload, timeout=30)
    if resp.status_code >= 400:
        log(f"ERROR admin login failed: {resp.status_code} {resp.text}")
        sys.exit(1)

    data = resp.json()
    token = data.get("token")
    if not token:
        log("ERROR: no token in admin login response.")
        sys.exit(1)

    SESSION.headers["Authorization"] = token
    log("Admin login successful.")


def list_collections():
    url = f"{PB_URL.rstrip('/')}/api/collections"
    # perPage large enough to get all
    params = {"page": 1, "perPage": 200}
    resp = SESSION.get(url, params=params, timeout=30)
    if resp.status_code >= 400:
        log(f"ERROR listing collections: {resp.status_code} {resp.text}")
        sys.exit(1)

    data = resp.json()
    items = data.get("items", [])
    return items


def drop_collection(coll_id: str, name: str):
    url = f"{PB_URL.rstrip('/')}/api/collections/{coll_id}"
    log(f"Dropping collection '{name}' (id={coll_id}) …")
    resp = SESSION.delete(url, timeout=30)
    if resp.status_code >= 400:
        log(f"  ERROR deleting: {resp.status_code} {resp.text}")
    else:
        log("  Deleted successfully.")


def main():
    require_env("PB_ADMIN_EMAIL")
    require_env("PB_ADMIN_PASSWORD")

    log(f"Using PB_URL={PB_URL}")
    admin_login()

    collections = list_collections()
    log(f"Found {len(collections)} collections total.")

    # Find target collections by name
    targets = [
        c for c in collections
        if c.get("name") in TARGET_COLLECTION_NAMES
    ]

    if not targets:
        log("No matching collections found for TARGET_COLLECTION_NAMES.")
        return

    log("Collections that will be DROPPED:")
    for c in targets:
        log(f"  - {c.get('name')} (id={c.get('id')}, system={c.get('system')})")

    # Safety: require explicit confirmation via env var
    if os.environ.get("PB_DROP_CONFIRM", "no").lower() not in ("yes", "true", "1"):
        log("")
        log("ABORTING: Set PB_DROP_CONFIRM=yes if you really want to drop these collections.")
        return

    for c in targets:
        drop_collection(c["id"], c["name"])

    log("Done dropping collections.")


if __name__ == "__main__":
    main()
