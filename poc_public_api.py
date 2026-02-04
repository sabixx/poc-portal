#!/usr/bin/env python3
"""
POC Portal – Public API Backend (Python + PocketBase)

Endpoints:

1) POST /api/register
   - Register/lookup a POC by se.email + prospect + product (composite key)
   - Returns existing poc_uid if found, or creates new POC and returns new poc_uid

2) POST /api/deregister
   - Mark a POC as inactive (for mistaken POC→demo cleanup)

3) POST /api/heartbeat
   - Daily status update with use cases including full metadata from YAML files
   - Includes order from config.json for poc_use_cases

4) POST /api/complete_use_case
   - Toggle completion status for a use case

5) POST /api/rating
   - Set star rating (1-5) for a use case

6) POST /api/feedback
   - Submit text feedback for a use case

Authentication / config via env vars:

  PB_BASE           e.g. "http://127.0.0.1:8090"
  PB_ADMIN_EMAIL    PocketBase ADMIN email
  PB_ADMIN_PASSWORD PocketBase ADMIN password
  API_PORT          default 8000
  API_SHARED_SECRET optional shared secret for X-Api-Key

PocketBase Schema:
  use_cases: code, title, description, version, product_family, product, category, estimate_hours, is_customer_prep, author
  poc_use_cases: poc, use_case, is_active, is_completed, completed_at, rating, order
"""

import os
import sys
import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
import secrets
import string
import uuid

import requests
from flask import Flask, request, jsonify

# ---------------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------------

LOG_FILE = os.getenv("API_LOG_FILE", "/data/poc_api.log")

# Ensure log directory exists
log_dir = os.path.dirname(LOG_FILE)
if log_dir and not os.path.exists(log_dir):
    try:
        os.makedirs(log_dir, exist_ok=True)
    except Exception:
        LOG_FILE = "/tmp/poc_api.log"

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PB_BASE = os.getenv("PB_BASE", "http://127.0.0.1:8090")
SERVICE_EMAIL = os.getenv("PB_ADMIN_EMAIL", "admin@example.com")
SERVICE_PASSWORD = os.getenv("PB_ADMIN_PASSWORD", "changeme123")
API_SHARED_SECRET = os.getenv("API_SHARED_SECRET")

SESSION = requests.Session()
AUTH_TOKEN: Optional[str] = None
AUTH_TOKEN_TIME: Optional[float] = None  # timestamp when token was obtained
AUTH_TOKEN_MAX_AGE = 3600  # refresh token every hour (PB default expiry is much longer, but refresh early)

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Request/Response Logging Middleware
# ---------------------------------------------------------------------------

# Endpoints to skip verbose logging (e.g., health checks)
QUIET_ENDPOINTS = {'/api/health'}

@app.before_request
def log_request_info():
    """Log details of every incoming request (skip health checks)."""
    if request.path in QUIET_ENDPOINTS:
        return
    
    logger.info("=" * 60)
    logger.info(f"INCOMING REQUEST: {request.method} {request.path}")
    logger.info(f"Remote IP: {request.remote_addr}")
    logger.info(f"Headers: {dict(request.headers)}")
    
    if request.method in ['POST', 'PUT', 'PATCH']:
        try:
            body = request.get_json(silent=True)
            if body:
                safe_body = body.copy() if isinstance(body, dict) else body
                if isinstance(safe_body, dict) and 'password' in safe_body:
                    safe_body['password'] = '***'
                logger.info(f"Request Body: {json.dumps(safe_body, indent=2)}")
            else:
                logger.info(f"Request Body (raw): {request.get_data(as_text=True)[:500]}")
        except Exception as e:
            logger.warning(f"Could not parse request body: {e}")

@app.after_request
def log_response_info(response):
    """Log response status (skip health checks)."""
    if request.path in QUIET_ENDPOINTS:
        return response
    
    logger.info(f"RESPONSE: {response.status_code} {response.status}")
    logger.info("=" * 60)
    return response

# ---------------------------------------------------------------------------
# Helpers: Auth, API key, PocketBase access
# ---------------------------------------------------------------------------


def service_login(force: bool = False):
    """Log in as PocketBase SUPERUSER and set the Bearer token on the session."""
    global AUTH_TOKEN, AUTH_TOKEN_TIME
    import time as _time

    # Check if token needs refresh (expired or too old)
    if AUTH_TOKEN and not force:
        token_age = _time.time() - (AUTH_TOKEN_TIME or 0)
        if token_age < AUTH_TOKEN_MAX_AGE:
            logger.debug(f"[service_login] Using cached auth token (age: {token_age:.0f}s)")
            return
        else:
            logger.info(f"[service_login] Token expired (age: {token_age:.0f}s > {AUTH_TOKEN_MAX_AGE}s), refreshing...")
            AUTH_TOKEN = None

    reason = "forced refresh" if force else ("expired" if AUTH_TOKEN_TIME else "initial login")
    logger.info(f"[service_login] Authenticating with PocketBase at {PB_BASE} (reason: {reason})")

    try:
        resp = SESSION.post(
            f"{PB_BASE}/api/collections/_superusers/auth-with-password",
            json={"identity": SERVICE_EMAIL, "password": SERVICE_PASSWORD},
            timeout=10,
        )
        logger.info(f"[service_login] Auth response status: {resp.status_code}")

        resp.raise_for_status()
        data = resp.json()
        token = data["token"]
        AUTH_TOKEN = token
        AUTH_TOKEN_TIME = _time.time()
        SESSION.headers["Authorization"] = f"Bearer {token}"
        logger.info(f"[service_login] Successfully logged in as SUPERUSER {SERVICE_EMAIL}")
    except Exception as e:
        logger.error(f"[service_login] Failed to login to PocketBase: {repr(e)}")
        raise


def verify_pocketbase_health() -> bool:
    """Check if PocketBase is responding and can read data. Auto-refreshes token if stale."""
    try:
        resp = SESSION.get(f"{PB_BASE}/api/health", timeout=5)
        if resp.status_code != 200:
            logger.error(f"[verify_pocketbase_health] Health check failed: {resp.status_code} - {resp.text}")
            return False

        # Also verify we can query the pocs collection
        service_login()
        pocs_resp = SESSION.get(f"{PB_BASE}/api/collections/pocs/records", params={"perPage": 1}, timeout=5)
        if pocs_resp.status_code != 200:
            logger.error(f"[verify_pocketbase_health] POCs query failed: {pocs_resp.status_code} - {pocs_resp.text}")
            return False

        pocs_data = pocs_resp.json()
        total = pocs_data.get("totalItems", -1)
        logger.info(f"[verify_pocketbase_health] PocketBase healthy, can see {total} POCs")

        # If we see 0 POCs, the token might be expired/stale - force refresh and retry
        if total == 0:
            logger.warning(f"[verify_pocketbase_health] 0 POCs detected, forcing token refresh...")
            service_login(force=True)
            retry_resp = SESSION.get(f"{PB_BASE}/api/collections/pocs/records", params={"perPage": 1}, timeout=5)
            if retry_resp.status_code == 200:
                retry_data = retry_resp.json()
                retry_total = retry_data.get("totalItems", -1)
                logger.info(f"[verify_pocketbase_health] After token refresh: can see {retry_total} POCs")
                if retry_total > 0:
                    return True
                else:
                    logger.error(f"[verify_pocketbase_health] Still 0 POCs after token refresh - genuine data issue")
                    return False
            else:
                logger.error(f"[verify_pocketbase_health] Retry after refresh failed: {retry_resp.status_code}")
                return False

        return True
    except Exception as e:
        logger.error(f"[verify_pocketbase_health] Exception during health check: {repr(e)}")
        return False


def check_api_key() -> bool:
    """Optional X-Api-Key protection."""
    if not API_SHARED_SECRET:
        return True
    hdr = request.headers.get("X-Api-Key")
    return hdr == API_SHARED_SECRET


def _generate_random_password(length: int = 16) -> str:
    """Generate a random password for auto-created SE users."""
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _generate_poc_uid() -> str:
    """Generate a unique POC UID."""
    return f"POC-{uuid.uuid4().hex[:12].upper()}"


def get_or_create_user_se(email: str, display_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Look up SE user by email in PocketBase `users` collection.
    If missing, auto-create with role='se' and trigger password reset email.
    """
    logger.info(f"[get_or_create_user_se] Starting for email~{email}, display_name={display_name}")
    
    service_login()

    email_lower = email.strip().lower()
    url = f"{PB_BASE}/api/collections/users/records"

    # Use ~ for case-insensitive matching
    resp = SESSION.get(
        url,
        params={"filter": f'email~"{email_lower}"', "perPage": 1},
        timeout=10,
    )
    
    if resp.status_code >= 400:
        logger.error(f"[get_or_create_user_se] User lookup failed: {resp.status_code} {resp.text}")
        raise Exception(f"User lookup failed: {resp.status_code} {resp.text}")

    resp.raise_for_status()
    items = resp.json().get("items", [])

    logger.info(f"[get_or_create_user_se] User lookup returned {len(items)} items for {email_lower}")

    if items:
        user = items[0]
        user_id = user["id"]
        current_role = user.get("role")

        logger.info(f"[get_or_create_user_se] Found existing user: id={user_id}, role={current_role}")

        if not current_role:
            try:
                SESSION.patch(f"{url}/{user_id}", json={"role": "se"}, timeout=10)
                logger.info(f"[get_or_create_user_se] Updated existing user {email_lower} -> role='se'")
            except Exception as e:
                logger.warning(f"[get_or_create_user_se] Failed to patch user role: {e}")

        return {"id": user_id, "is_new": False, "email": email_lower}

    # User not found -> create
    logger.warning(f"[get_or_create_user_se] No user found for {email_lower}, will create new user")
    password = _generate_random_password()
    name = display_name or email_lower.split("@")[0].replace(".", " ").title()
    
    payload = {
        "email": email_lower,
        "emailVisibility": True,
        "password": password,
        "passwordConfirm": password,
        "role": "se",
        "name": name,
        "displayName": name,
    }

    resp = SESSION.post(url, json=payload, timeout=10)
    
    if resp.status_code >= 400:
        logger.error(f"[get_or_create_user_se] User creation failed: {resp.status_code} {resp.text}")
        raise Exception(f"User creation failed: {resp.status_code} {resp.text}")

    resp.raise_for_status()
    user = resp.json()
    user_id = user["id"]

    logger.info(f"[get_or_create_user_se] Created SE user: id={user_id}, email~{email_lower}")
    
    # Trigger password reset email
    try:
        SESSION.post(
            f"{PB_BASE}/api/collections/users/request-password-reset",
            json={"email": email_lower},
            timeout=10,
        )
        logger.info(f"[get_or_create_user_se] Password reset email sent to {email_lower}")
    except Exception as e:
        logger.warning(f"[get_or_create_user_se] Could not send password reset email: {e}")
    
    return {"id": user_id, "is_new": True, "email": email_lower}


def find_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Find a user by email. Returns user dict if found, None otherwise."""
    service_login()

    email_lower = email.strip().lower()
    url = f"{PB_BASE}/api/collections/users/records"

    logger.info(f"[find_user_by_email] Searching for email: {email_lower}")

    resp = SESSION.get(
        url,
        params={"filter": f'email~"{email_lower}"', "perPage": 1},
        timeout=10,
    )

    logger.info(f"[find_user_by_email] Response status: {resp.status_code}")

    if resp.status_code >= 400:
        logger.error(f"[find_user_by_email] Error response: {resp.text}")
        return None

    items = resp.json().get("items", [])
    logger.info(f"[find_user_by_email] Found {len(items)} users")

    if items:
        logger.info(f"[find_user_by_email] Returning user: {items[0].get('id')}, {items[0].get('email')}")
    else:
        logger.warning(f"[find_user_by_email] No user found for email: {email_lower}")

    return items[0] if items else None


def find_poc_by_composite_key(sa_email: str, customer_name: str, product: str) -> Optional[Dict[str, Any]]:
    """Find an existing POC by the composite key: se.email + customer_name + product."""
    logger.info(f"[find_poc_by_composite_key] Looking for POC: sa_email={sa_email}, customer={customer_name}, product={product}")

    service_login()

    user = find_user_by_email(sa_email)
    if not user:
        logger.warning(f"[find_poc_by_composite_key] No user found for email {sa_email}")
        return None

    user_id = user["id"]
    logger.info(f"[find_poc_by_composite_key] Found user {sa_email} -> id={user_id}")

    customer_escaped = customer_name.replace('"', '\\"')
    product_escaped = product.replace('"', '\\"')

    filter_expr = f'se="{user_id}" && customer_name="{customer_escaped}" && product="{product_escaped}"'
    url = f"{PB_BASE}/api/collections/pocs/records"

    logger.info(f"[find_poc_by_composite_key] GET {url} with filter: {filter_expr}")

    resp = SESSION.get(
        url,
        params={"filter": filter_expr, "perPage": 1},
        timeout=10,
    )

    logger.info(f"[find_poc_by_composite_key] Response status: {resp.status_code}")

    if resp.status_code >= 400:
        logger.error(f"[find_poc_by_composite_key] Error response: {resp.status_code} - {resp.text}")
        return None

    data = resp.json()
    items = data.get("items", [])
    total_items = data.get("totalItems", 0)

    logger.info(f"[find_poc_by_composite_key] Found {len(items)} items, totalItems={total_items}")

    if items:
        poc = items[0]
        logger.info(f"[find_poc_by_composite_key] Found POC: id={poc.get('id')}, poc_uid={poc.get('poc_uid')}")
        return poc

    logger.info(f"[find_poc_by_composite_key] No POC found for composite key")
    return None


def find_poc_by_uid(poc_uid: str) -> Optional[Dict[str, Any]]:
    """Find a POC by its poc_uid."""
    logger.info(f"[find_poc_by_uid] Searching for poc_uid: {poc_uid}")

    service_login()

    filter_param = f'poc_uid="{poc_uid}"'
    url = f"{PB_BASE}/api/collections/pocs/records"

    logger.info(f"[find_poc_by_uid] GET {url} with filter: {filter_param}")
    logger.info(f"[find_poc_by_uid] Session auth header present: {'Authorization' in SESSION.headers}")

    resp = SESSION.get(
        url,
        params={"filter": filter_param, "perPage": 1},
        timeout=10,
    )

    logger.info(f"[find_poc_by_uid] Response status: {resp.status_code}")
    logger.info(f"[find_poc_by_uid] Response body: {resp.text[:500]}")

    if resp.status_code >= 400:
        logger.error(f"[find_poc_by_uid] Error response for {poc_uid}: {resp.status_code} - {resp.text}")
        return None

    data = resp.json()
    items = data.get("items", [])
    total_items = data.get("totalItems", 0)

    logger.info(f"[find_poc_by_uid] Found {len(items)} items, totalItems={total_items}")

    if items:
        poc = items[0]
        logger.info(f"[find_poc_by_uid] Returning POC: id={poc.get('id')}, poc_uid={poc.get('poc_uid')}")
        return poc
    else:
        # Diagnostic: check if PocketBase can see ANY pocs
        logger.warning(f"[find_poc_by_uid] No POC found for {poc_uid}, running diagnostic...")
        try:
            diag_resp = SESSION.get(f"{PB_BASE}/api/collections/pocs/records", params={"perPage": 1}, timeout=5)
            diag_data = diag_resp.json()
            diag_total = diag_data.get("totalItems", 0)
            logger.warning(f"[find_poc_by_uid] DIAGNOSTIC: PocketBase sees {diag_total} total POCs in collection")
            if diag_total == 0:
                logger.error(f"[find_poc_by_uid] CRITICAL: PocketBase cannot see ANY POCs - likely DB sync issue!")
        except Exception as e:
            logger.error(f"[find_poc_by_uid] Diagnostic check failed: {e}")

        return None


def get_or_create_usecase(
    code: str,
    title: Optional[str] = None,
    version: int = 1,
    product_family: Optional[str] = None,
    product: Optional[str] = None,
    category: Optional[str] = None,
    description: Optional[str] = None,
    estimate_hours: Optional[int] = None,
    is_customer_prep: Optional[bool] = None,
    author: Optional[str] = None,
) -> str:
    """
    Ensure a use case record exists in use_cases collection.
    Accepts all metadata fields from YAML files.
    Updates existing records if metadata has changed.
    
    Returns the use case record ID.
    """
    service_login()

    filter_expr = f'code="{code}" && version={int(version)}'
    resp = SESSION.get(
        f"{PB_BASE}/api/collections/use_cases/records",
        params={"filter": filter_expr, "perPage": 1},
        timeout=10,
    )
    resp.raise_for_status()
    items = resp.json().get("items", [])

    if items:
        existing = items[0]
        uc_id = existing["id"]
        
        # Check if we need to update any fields
        update_payload: Dict[str, Any] = {}
        
        if title and existing.get("title") != title:
            update_payload["title"] = title
        if description is not None and existing.get("description") != description:
            update_payload["description"] = description
        if product_family is not None and existing.get("product_family") != product_family:
            update_payload["product_family"] = product_family
        if product is not None and existing.get("product") != product:
            update_payload["product"] = product
        if category is not None and existing.get("category") != category:
            update_payload["category"] = category
        if estimate_hours is not None and existing.get("estimate_hours") != estimate_hours:
            update_payload["estimate_hours"] = estimate_hours
        if is_customer_prep is not None and existing.get("is_customer_prep") != is_customer_prep:
            update_payload["is_customer_prep"] = is_customer_prep
        if author is not None and existing.get("author") != author:
            update_payload["author"] = author
        
        if update_payload:
            logger.info(f"Updating use_case {code} with: {update_payload}")
            resp = SESSION.patch(
                f"{PB_BASE}/api/collections/use_cases/records/{uc_id}",
                json=update_payload,
                timeout=10,
            )
            if resp.status_code >= 400:
                logger.warning(f"Failed to update use_case {code}: {resp.status_code} {resp.text}")
        
        return uc_id

    # Create new use case
    if not title:
        title = code.split('/').pop().replace("-", " ").title()

    payload: Dict[str, Any] = {
        "code": code,
        "title": title,
        "version": int(version),
    }
    
    if description is not None:
        payload["description"] = description
    if product_family is not None:
        payload["product_family"] = product_family
    if product is not None:
        payload["product"] = product
    if category is not None:
        payload["category"] = category
    if estimate_hours is not None:
        payload["estimate_hours"] = estimate_hours
    if is_customer_prep is not None:
        payload["is_customer_prep"] = is_customer_prep
    if author is not None:
        payload["author"] = author

    logger.info(f"Creating use_case {code} with payload: {payload}")

    resp = SESSION.post(
        f"{PB_BASE}/api/collections/use_cases/records",
        json=payload,
        timeout=10,
    )
    resp.raise_for_status()
    uc = resp.json()
    logger.info(f"Created use_case {code} v{version}")
    return uc["id"]


def get_or_create_poc_usecase(
    poc_id: str,
    uc_id: str,
    order: Optional[int] = None,
    is_active: Optional[bool] = None,
    is_completed: Optional[bool] = None,
) -> str:
    """
    Get or create the poc_use_cases link between a POC and a use case.

    Args:
        poc_id: POC record ID
        uc_id: use_case record ID
        order: Display order from config.json useCaseOrder
        is_active: Whether the use case is active (only updated if explicitly provided)
        is_completed: Whether the use case is completed (only updated if explicitly provided)

    Returns the poc_use_case record ID.
    """
    service_login()

    resp = SESSION.get(
        f"{PB_BASE}/api/collections/poc_use_cases/records",
        params={"filter": f'poc="{poc_id}" && use_case="{uc_id}"'},
        timeout=10,
    )
    resp.raise_for_status()
    items = resp.json().get("items", [])

    if items:
        existing = items[0]
        puc_id = existing["id"]

        # Build update payload - only update fields that are explicitly provided
        update_payload: Dict[str, Any] = {}

        if order is not None and existing.get("order") != order:
            update_payload["order"] = order
        if is_active is not None and existing.get("is_active") != is_active:
            update_payload["is_active"] = is_active
        if is_completed is not None and existing.get("is_completed") != is_completed:
            update_payload["is_completed"] = is_completed
            if is_completed:
                update_payload["completed_at"] = datetime.utcnow().isoformat() + "Z"
            else:
                update_payload["completed_at"] = None

        if update_payload:
            SESSION.patch(
                f"{PB_BASE}/api/collections/poc_use_cases/records/{puc_id}",
                json=update_payload,
                timeout=10,
            )
            logger.info(f"Updated poc_use_case {puc_id}: {update_payload}")

        return puc_id

    # Create new - use defaults for unspecified fields
    create_payload: Dict[str, Any] = {
        "poc": poc_id,
        "use_case": uc_id,
        "is_active": is_active if is_active is not None else True,
        "is_completed": is_completed if is_completed is not None else False,
    }

    if order is not None:
        create_payload["order"] = order

    if create_payload["is_completed"]:
        create_payload["completed_at"] = datetime.utcnow().isoformat() + "Z"

    resp = SESSION.post(
        f"{PB_BASE}/api/collections/poc_use_cases/records",
        json=create_payload,
        timeout=10,
    )
    resp.raise_for_status()
    puc = resp.json()
    logger.info(f"Created poc_use_case for POC {poc_id}, UC {uc_id}, order={order}")
    return puc["id"]


# ---------------------------------------------------------------------------
# Endpoint: POST /api/register
# ---------------------------------------------------------------------------


@app.route("/api/register", methods=["POST"])
def api_register():
    """
    Register or lookup a POC by composite key (se.email + prospect + product).

    Expected JSON:
    {
      "sa_name": "Jens Sabitzer",
      "sa_email": "jens.sabitzer@cyberark.com",
      "prospect": "ACME Bank",
      "product": "Certificate Manager SaaS",
      "partner": "BigPartner GmbH",        // optional
      "poc_start_date": "2025-12-04",      // optional
      "poc_end_date": "2026-01-03"         // optional
    }

    Response:
    {
      "status": "ok",
      "poc_uid": "POC-ABC123DEF456",
      "is_new": true/false
    }
    """
    if not check_api_key():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "invalid_json"}), 400

    sa_email = data.get("sa_email")
    sa_name = data.get("sa_name")
    prospect = data.get("prospect")
    product = data.get("product")

    if not sa_email or not prospect or not product:
        return jsonify({
            "error": "missing_required_fields",
            "details": "sa_email, prospect, and product are required"
        }), 400

    try:
        # Early health check - log PocketBase state before processing
        logger.info(f"[register] Starting registration for sa_email={sa_email}, prospect={prospect}, product={product}")
        pb_healthy = verify_pocketbase_health()
        if not pb_healthy:
            logger.error(f"[register] PocketBase health check FAILED before processing registration")

        service_login()

        # Check if POC already exists
        existing_poc = find_poc_by_composite_key(sa_email, prospect, product)

        if existing_poc:
            poc_uid = existing_poc["poc_uid"]
            poc_id = existing_poc["id"]

            # Update optional fields if provided
            patch: Dict[str, Any] = {}
            if data.get("partner"):
                patch["partner"] = data["partner"]
            if data.get("poc_start_date"):
                patch["poc_start_date"] = data["poc_start_date"]
            if data.get("poc_end_date"):
                patch["poc_end_date_plan"] = data["poc_end_date"]

            if patch:
                SESSION.patch(
                    f"{PB_BASE}/api/collections/pocs/records/{poc_id}",
                    json=patch,
                    timeout=10,
                )

            logger.info(f"Found existing POC: {poc_uid}")
            return jsonify({"status": "ok", "poc_uid": poc_uid, "is_new": False}), 200

        # Create new POC
        user_result = get_or_create_user_se(sa_email, display_name=sa_name)
        se_id = user_result["id"]
        user_is_new = user_result["is_new"]
        
        if not se_id:
            return jsonify({
                "error": "user_creation_failed",
                "details": f"Could not create or find user for {sa_email}"
            }), 500
        
        poc_uid = _generate_poc_uid()

        payload: Dict[str, Any] = {
            "poc_uid": poc_uid,
            "product": product,
            "name": f"{prospect} - {product}",
            "customer_name": prospect,
            "se": se_id,
            "is_active": True,
            "is_completed": False,
            "risk_status": "on_track",
            "last_daily_update_at": datetime.utcnow().isoformat() + "Z",
        }

        if data.get("partner"):
            payload["partner"] = data["partner"]
        if data.get("poc_start_date"):
            payload["poc_start_date"] = data["poc_start_date"]
        if data.get("poc_end_date"):
            payload["poc_end_date_plan"] = data["poc_end_date"]

        logger.info(f"[register] Creating POC with payload: {json.dumps(payload)}")
        logger.info(f"[register] POST URL: {PB_BASE}/api/collections/pocs/records")
        logger.info(f"[register] Session headers: {dict(SESSION.headers)}")

        resp = SESSION.post(
            f"{PB_BASE}/api/collections/pocs/records",
            json=payload,
            timeout=10,
        )

        logger.info(f"[register] PocketBase response status: {resp.status_code}")
        logger.info(f"[register] PocketBase response body: {resp.text}")

        resp.raise_for_status()

        logger.info(f"Created new POC: {poc_uid}")
        
        response_data = {"status": "ok", "poc_uid": poc_uid, "is_new": True}
        
        if user_is_new:
            response_data["user_created"] = True
            response_data["user_email"] = sa_email
            response_data["message"] = f"A password reset email has been sent to {sa_email}"
        
        return jsonify(response_data), 200

    except requests.HTTPError as e:
        logger.error(f"HTTPError in register: {e.response.text}")
        return jsonify({"error": "backend_http_error", "details": e.response.text}), 500
    except Exception as e:
        logger.error(f"Exception in register: {repr(e)}")
        return jsonify({"error": "internal_error", "details": str(e)}), 500


# ---------------------------------------------------------------------------
# Endpoint: POST /api/deregister
# ---------------------------------------------------------------------------


@app.route("/api/deregister", methods=["POST"])
def api_deregister():
    """
    Mark a POC as inactive (deregister).

    Expected JSON:
    {
      "poc_uid": "POC-ABC123DEF456"
    }
    """
    if not check_api_key():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "invalid_json"}), 400

    poc_uid = data.get("poc_uid")
    if not poc_uid:
        return jsonify({"error": "missing_poc_uid"}), 400

    try:
        service_login()

        poc = find_poc_by_uid(poc_uid)
        if not poc:
            return jsonify({
                "status": "ok",
                "poc_uid": poc_uid,
                "message": "POC not found (already deregistered or never existed)"
            }), 200

        SESSION.patch(
            f"{PB_BASE}/api/collections/pocs/records/{poc['id']}",
            json={
                "is_active": False,
                "deregistered_at": datetime.utcnow().isoformat() + "Z"
            },
            timeout=10,
        )

        logger.info(f"Deregistered POC: {poc_uid}")
        return jsonify({"status": "ok", "poc_uid": poc_uid, "message": "POC deregistered"}), 200

    except requests.HTTPError as e:
        logger.error(f"HTTPError in deregister: {e.response.text}")
        return jsonify({"error": "backend_http_error", "details": e.response.text}), 500
    except Exception as e:
        logger.error(f"Exception in deregister: {repr(e)}")
        return jsonify({"error": "internal_error", "details": str(e)}), 500


# ---------------------------------------------------------------------------
# Endpoint: POST /api/heartbeat
# ---------------------------------------------------------------------------


@app.route("/api/heartbeat", methods=["POST"])
def api_heartbeat():
    """
    Daily heartbeat with use cases including full metadata.

    Expected JSON:
    {
      "poc_uid": "POC-ABC123DEF456",
      "use_cases": [
        {
          "code": "machine-identity/dashboard",
          "is_active": true,
          "is_completed": false,
          "order": 5,                              // from config.json useCaseOrder
          "title": "Dashboard",                    // from YAML: name
          "version": 1,                            // from YAML: version
          "author": "",                            // from YAML: author
          "description": "...",                    // from YAML: description
          "product": "Certificate Manager SaaS",   // from YAML: product
          "product_family": "Secrets",             // from YAML: productCategory
          "category": "Getting Started",           // from YAML: category
          "estimate_hours": 2,                     // from YAML: estimatedHours
          "is_customer_prep": false                // from YAML: customerPreparation
        },
        ...
      ]
    }

    Response:
    {
      "status": "ok",
      "poc_uid": "POC-ABC123DEF456",
      "use_cases_processed": 30
    }
    """
    if not check_api_key():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "invalid_json"}), 400

    poc_uid = data.get("poc_uid")
    if not poc_uid:
        return jsonify({"error": "missing_poc_uid"}), 400

    use_cases_data = data.get("use_cases")
    if not use_cases_data or not isinstance(use_cases_data, list):
        return jsonify({"error": "missing_use_cases", "details": "use_cases array is required"}), 400

    try:
        # Early health check - log PocketBase state before processing
        logger.info(f"[heartbeat] Starting heartbeat for POC {poc_uid}")
        pb_healthy = verify_pocketbase_health()
        if not pb_healthy:
            logger.error(f"[heartbeat] PocketBase health check FAILED before processing heartbeat for {poc_uid}")
            # Continue anyway to see what happens, but log the issue

        poc = find_poc_by_uid(poc_uid)
        if not poc:
            # Log additional context when POC not found
            logger.error(f"[heartbeat] POC NOT FOUND: {poc_uid} - pb_healthy_before={pb_healthy}")
            return jsonify({"error": "poc_not_found", "details": f"POC {poc_uid} not found"}), 404

        poc_id = poc["id"]

        # Update last_daily_update_at
        SESSION.patch(
            f"{PB_BASE}/api/collections/pocs/records/{poc_id}",
            json={"last_daily_update_at": datetime.utcnow().isoformat() + "Z"},
            timeout=10,
        )
        
        resp = SESSION.get(
            f"{PB_BASE}/api/collections/poc_use_cases/records",
            params={"filter": f'poc="{poc_id}"', "perPage": 500},
            timeout=10,
        )
        resp.raise_for_status()
        existing_pucs = resp.json().get("items", [])
        
        deactivated_count = 0
        for puc in existing_pucs:
            if puc.get("is_active"):
                SESSION.patch(
                    f"{PB_BASE}/api/collections/poc_use_cases/records/{puc['id']}",
                    json={"is_active": False},
                    timeout=10,
                )
                deactivated_count += 1
        
        logger.info(f"[heartbeat] Deactivated {deactivated_count} existing poc_use_cases for POC {poc_uid}")
      
        # Process each use case
        processed_count = 0
        
        for uc_data in use_cases_data:
            uc_code = uc_data.get("code")
            if not uc_code:
                logger.warning(f"[heartbeat] Skipping use case without code")
                continue
            
            # Extract use_case metadata (for use_cases collection)
            title = uc_data.get("title")
            version = uc_data.get("version", 1)
            author = uc_data.get("author")
            description = uc_data.get("description")
            product = uc_data.get("product")
            product_family = uc_data.get("product_family")
            category = uc_data.get("category")
            estimate_hours = uc_data.get("estimate_hours")
            is_customer_prep = uc_data.get("is_customer_prep")
            
            # Extract poc_use_case fields
            order = uc_data.get("order")  # from config.json useCaseOrder
            is_active = uc_data.get("is_active", True)
            is_completed = uc_data.get("is_completed", False)
            
            # Create/update use_case with all metadata
            uc_id = get_or_create_usecase(
                code=uc_code,
                title=title,
                version=int(version) if version else 1,
                product_family=product_family,
                product=product,
                category=category,
                description=description,
                estimate_hours=int(estimate_hours) if estimate_hours is not None else None,
                is_customer_prep=is_customer_prep,
                author=author,
            )
            
            # Create/update poc_use_case link with order
            get_or_create_poc_usecase(
                poc_id=poc_id,
                uc_id=uc_id,
                order=int(order) if order is not None else None,
                is_active=is_active,
                is_completed=is_completed,
            )
            
            processed_count += 1
        
        logger.info(f"Heartbeat for POC {poc_uid}: processed {processed_count} use cases")
        
        return jsonify({
            "status": "ok",
            "poc_uid": poc_uid,
            "use_cases_processed": processed_count
        }), 200

    except requests.HTTPError as e:
        logger.error(f"HTTPError in heartbeat: {e.response.text}")
        return jsonify({"error": "backend_http_error", "details": e.response.text}), 500
    except Exception as e:
        logger.error(f"Exception in heartbeat: {repr(e)}")
        return jsonify({"error": "internal_error", "details": str(e)}), 500


# ---------------------------------------------------------------------------
# Endpoint: POST /api/complete_use_case
# ---------------------------------------------------------------------------


@app.route("/api/complete_use_case", methods=["POST"])
def api_complete_use_case():
    """
    Toggle completion status for a use case.

    Expected JSON:
    {
      "poc_uid": "POC-ABC123DEF456",
      "use_case_code": "machine-identity/dashboard",
      "completed": true
    }
    """
    if not check_api_key():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "invalid_json"}), 400

    poc_uid = data.get("poc_uid")
    use_case_code = data.get("use_case_code")
    completed = data.get("completed")

    if not poc_uid or not use_case_code or completed is None:
        return jsonify({
            "error": "missing_required_fields",
            "details": "poc_uid, use_case_code, and completed are required"
        }), 400

    try:
        service_login()

        poc = find_poc_by_uid(poc_uid)
        if not poc:
            return jsonify({"error": "poc_not_found"}), 404

        poc_id = poc["id"]
        uc_id = get_or_create_usecase(use_case_code)
        
        get_or_create_poc_usecase(
            poc_id=poc_id,
            uc_id=uc_id,
            is_active=True,
            is_completed=bool(completed),
        )

        logger.info(f"Use case {use_case_code} marked completed={completed} for POC {poc_uid}")
        return jsonify({
            "status": "ok",
            "poc_uid": poc_uid,
            "use_case_code": use_case_code,
            "completed": bool(completed)
        }), 200

    except requests.HTTPError as e:
        logger.error(f"HTTPError in complete_use_case: {e.response.text}")
        return jsonify({"error": "backend_http_error", "details": e.response.text}), 500
    except Exception as e:
        logger.error(f"Exception in complete_use_case: {repr(e)}")
        return jsonify({"error": "internal_error", "details": str(e)}), 500


# ---------------------------------------------------------------------------
# Endpoint: POST /api/rating
# ---------------------------------------------------------------------------


@app.route("/api/rating", methods=["POST"])
def api_rating():
    """
    Set star rating (1-5) for a use case.

    Expected JSON:
    {
      "poc_uid": "POC-ABC123DEF456",
      "use_case_code": "machine-identity/dashboard",
      "rating": 4
    }
    """
    if not check_api_key():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "invalid_json"}), 400

    poc_uid = data.get("poc_uid")
    use_case_code = data.get("use_case_code")
    rating = data.get("rating")

    if not poc_uid or not use_case_code or rating is None:
        return jsonify({
            "error": "missing_required_fields",
            "details": "poc_uid, use_case_code, and rating are required"
        }), 400

    try:
        rating = int(rating)
        if rating < 1 or rating > 5:
            raise ValueError("Rating must be between 1 and 5")
    except (ValueError, TypeError) as e:
        return jsonify({"error": "invalid_rating", "details": str(e)}), 400

    try:
        service_login()

        poc = find_poc_by_uid(poc_uid)
        if not poc:
            return jsonify({"error": "poc_not_found"}), 404

        poc_id = poc["id"]
        uc_id = get_or_create_usecase(use_case_code)
        puc_id = get_or_create_poc_usecase(poc_id=poc_id, uc_id=uc_id)

        SESSION.patch(
            f"{PB_BASE}/api/collections/poc_use_cases/records/{puc_id}",
            json={"rating": rating},
            timeout=10,
        )

        logger.info(f"Rating {rating} set for {use_case_code} in POC {poc_uid}")
        return jsonify({
            "status": "ok",
            "poc_uid": poc_uid,
            "use_case_code": use_case_code,
            "rating": rating
        }), 200

    except requests.HTTPError as e:
        logger.error(f"HTTPError in rating: {e.response.text}")
        return jsonify({"error": "backend_http_error", "details": e.response.text}), 500
    except Exception as e:
        logger.error(f"Exception in rating: {repr(e)}")
        return jsonify({"error": "internal_error", "details": str(e)}), 500


# ---------------------------------------------------------------------------
# Endpoint: POST /api/feedback
# ---------------------------------------------------------------------------


@app.route("/api/feedback", methods=["POST"])
def api_feedback():
    """
    Submit text feedback for a use case.

    Expected JSON:
    {
      "poc_uid": "POC-ABC123DEF456",
      "use_case_code": "machine-identity/dashboard",
      "text": "Great feature!"
    }
    """
    if not check_api_key():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "invalid_json"}), 400

    poc_uid = data.get("poc_uid")
    use_case_code = data.get("use_case_code")
    text = data.get("text", "").strip()

    if not poc_uid or not use_case_code:
        return jsonify({
            "error": "missing_required_fields",
            "details": "poc_uid and use_case_code are required"
        }), 400

    if not text:
        return jsonify({"error": "missing_text"}), 400

    try:
        service_login()

        poc = find_poc_by_uid(poc_uid)
        if not poc:
            return jsonify({"error": "poc_not_found"}), 404

        poc_id = poc["id"]
        se_id = poc.get("se")

        uc_id = get_or_create_usecase(use_case_code)
        puc_id = get_or_create_poc_usecase(poc_id=poc_id, uc_id=uc_id)

        comment_payload: Dict[str, Any] = {
            "poc": poc_id,
            "poc_use_case": puc_id,
            "kind": "feedback",
            "text": text,
        }

        if se_id:
            comment_payload["author"] = se_id

        resp = SESSION.post(
            f"{PB_BASE}/api/collections/comments/records",
            json=comment_payload,
            timeout=10,
        )
        resp.raise_for_status()
        comment = resp.json()

        logger.info(f"Feedback submitted for {use_case_code} in POC {poc_uid}")
        return jsonify({
            "status": "ok",
            "poc_uid": poc_uid,
            "use_case_code": use_case_code,
            "comment_id": comment["id"]
        }), 200

    except requests.HTTPError as e:
        logger.error(f"HTTPError in feedback: {e.response.text}")
        return jsonify({"error": "backend_http_error", "details": e.response.text}), 500
    except Exception as e:
        logger.error(f"Exception in feedback: {repr(e)}")
        return jsonify({"error": "internal_error", "details": str(e)}), 500


# ---------------------------------------------------------------------------
# Health check endpoint
# ---------------------------------------------------------------------------


@app.route("/api/health", methods=["GET"])
def api_health():
    """Simple health check endpoint."""
    return jsonify({"status": "ok", "timestamp": datetime.utcnow().isoformat() + "Z"}), 200


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("API_PORT", "8000"))

    logger.info("=" * 70)
    logger.info("POC Portal API - VERSION 3.2")
    logger.info("=" * 70)
    logger.info(f"  PB_BASE:           {PB_BASE}")
    logger.info(f"  SERVICE_EMAIL:     {SERVICE_EMAIL}")
    logger.info(f"  API_PORT:          {port}")
    logger.info(f"  API_SHARED_SECRET: {'SET' if API_SHARED_SECRET else 'NOT SET'}")
    logger.info("=" * 70)

    try:
        service_login()
        logger.info(f"Service login OK")
    except Exception as e:
        logger.warning(f"PocketBase connectivity check failed: {repr(e)}")

    logger.info(f"Starting POC public API on 0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port)