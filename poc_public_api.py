#!/usr/bin/env python3
"""
POC Portal – Public API Backend (Python + PocketBase)

Exposes 3 endpoints:

1) POST /api/daily_update
   - Daily snapshot of a POC (who is the SE, which use cases are in scope,
     which are active/completed, etc.).
   - Creates/updates:
       * SE mapping (users collection in PocketBase)
       * POC record (pocs collection)
       * Use case records (use_cases collection, including version/product info, category,
       * Poc-use-case links (poc_use_cases collection)

2) POST /api/complete_use_case
   - Mark a single use case as completed for a POC.
   - Optional rating + feedback text.

3) POST /api/comment
   - Add a feedback or question entry for a specific POC/use case.

Authentication / config via env vars:

  PB_BASE           e.g. "http://127.0.0.1:8090"
  PB_API_EMAIL      PocketBase ADMIN email
  PB_API_PASSWORD   PocketBase ADMIN password
  API_PORT          default 8000
  API_SHARED_SECRET optional shared secret for X-Api-Key (if set, required)
"""

import os
import json
from datetime import datetime
from typing import Optional, Dict, Any, List

import secrets
import string

import requests
from flask import Flask, request, jsonify

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PB_BASE = os.getenv("PB_BASE", "http://127.0.0.1:8090")
SERVICE_EMAIL = os.getenv("PB_ADMIN_EMAIL", "admin@example.com")
SERVICE_PASSWORD = os.getenv("PB_ADMIN_PASSWORD", "changeme123")

API_SHARED_SECRET = os.getenv("API_SHARED_SECRET")

SESSION = requests.Session()
AUTH_TOKEN: Optional[str] = None

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Helpers: Auth, API key, PocketBase access
# ---------------------------------------------------------------------------

def service_login():
    """Log in as PocketBase SUPERUSER and set the Bearer token on the session."""
    global AUTH_TOKEN
    if AUTH_TOKEN:
        return

    resp = SESSION.post(
        f"{PB_BASE}/api/collections/_superusers/auth-with-password",
        json={"identity": SERVICE_EMAIL, "password": SERVICE_PASSWORD},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    token = data["token"]
    AUTH_TOKEN = token
    SESSION.headers["Authorization"] = f"Bearer {token}"
    print(f"[API] Service logged in as SUPERUSER {SERVICE_EMAIL}")


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


def get_or_create_user_se(email: str) -> str:
    """
    Look up SE user by email in PocketBase `users` collection.

    - If the user exists -> return its id (and ensure role includes 'se').
    - If the user is missing -> auto-create it with role='se' and a random password.
    """
    service_login()

    email_lower = email.strip().lower()
    url = f"{PB_BASE}/api/collections/users/records"

    # 1) Try to find existing user by email via filter
    resp = SESSION.get(
        url,
        params={
            "filter": f'email="{email_lower}"',
            "perPage": 1,
        },
        timeout=10,
    )
    resp.raise_for_status()
    items = resp.json().get("items", [])

    if items:
        user = items[0]
        user_id = user["id"]
        current_role = user.get("role")

        # If role is empty, set it to 'se' so it behaves as expected
        if not current_role:
            try:
                SESSION.patch(
                    f"{url}/{user_id}",
                    json={"role": "se"},
                    timeout=10,
                )
                print(f"[API] Updated existing user {email_lower} -> role='se'")
            except requests.HTTPError as e:
                print("[API] WARNING: failed to patch user role:", e.response.text)

        print(f"[API] Found SE user {email_lower} as id={user_id}")
        return user_id

    # 2) User not found -> create a new SE user
    password = _generate_random_password()

    payload = {
        "email": email_lower,
        "emailVisibility": True,
        "password": password,
        "passwordConfirm": password,
        "role": "se",
        "displayName": email_lower.split("@")[0],
    }

    resp = SESSION.post(
        url,
        json=payload,
        timeout=10,
    )
    resp.raise_for_status()
    user = resp.json()
    user_id = user["id"]

    print(
        f"[API] Created SE user {email_lower} as id={user_id} "
        f"(random password, role='se')"
    )
    return user_id


def get_or_create_usecase(
    code: str,
    title: Optional[str] = None,
    version: int = 1,
    product_family: Optional[str] = None,
    product: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    is_customer_prep: Optional[bool] = None,
    estimate_hours: Optional[float] = None,
) -> str:
    """
    Ensure a use case record exists in `use_cases` with the given code+version.
    If it already exists, update meta fields (incl. category,
    is_customer_prep, estimate_hours) if necessary.
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
        uc = items[0]
        uc_id = uc["id"]

        patch: Dict[str, Any] = {}

        # Only patch when something changed – avoids unnecessary writes
        if title and uc.get("title") != title:
            patch["title"] = title
        if product_family and uc.get("product_family") != product_family:
            patch["product_family"] = product_family
        if product and uc.get("product") != product:
            patch["product"] = product
        if description and uc.get("description") != description:
            patch["description"] = description
        if category and uc.get("category") != category:
            patch["category"] = category
        if is_customer_prep is not None and uc.get("is_customer_prep") != bool(
            is_customer_prep
        ):
            patch["is_customer_prep"] = bool(is_customer_prep)
        if (
            estimate_hours is not None 
            and uc.get("estimate_hours") != float(estimate_hours)
        ):
            patch["estimate_hours"] = float(estimate_hours)

        if patch:
            SESSION.patch(
                f"{PB_BASE}/api/collections/use_cases/records/{uc_id}",
                json=patch,
                timeout=10,
            )
            print(f"[API] Updated use_case {code} v{version} with {patch}")

        return uc_id

    # --- does not exist yet → create ---
    if not title:
        title = code.replace("-", " ").title()

    payload: Dict[str, Any] = {
        "code": code,
        "title": title,
        "version": int(version),
    }
    if product_family:
        payload["product_family"] = product_family
    if product:
        payload["product"] = product
    if description:
        payload["description"] = description
    if category:
        payload["category"] = category
    if is_customer_prep is not None:
        payload["is_customer_prep"] = bool(is_customer_prep)
    if estimate_hours is not None:
        payload["estimate_hours"] = float(estimate_hours)

    resp = SESSION.post(
        f"{PB_BASE}/api/collections/use_cases/records",
        json=payload,
        timeout=10,
    )
    resp.raise_for_status()
    uc = resp.json()
    print(f"[API] Created use_case {code} v{version}")
    return uc["id"]


def get_or_create_poc(
    poc_uid: str,
    name: Optional[str],
    customer_name: Optional[str],
    se_id: str,
    partner: Optional[str] = None,
) -> str:
    """Get or create a POC record by poc_uid."""
    service_login()
    resp = SESSION.get(
        f"{PB_BASE}/api/collections/pocs/records",
        params={"filter": f'poc_uid="{poc_uid}"'},
        timeout=10,
    )
    resp.raise_for_status()
    items = resp.json().get("items", [])
    if items:
        return items[0]["id"]

    payload: Dict[str, Any] = {
        "poc_uid": poc_uid,
        "name": name or poc_uid,
        "customer_name": customer_name,
        "se": se_id,
        "is_active": True,
        "is_completed": False,
        "risk_status": "on_track",
        "last_daily_update_at": datetime.utcnow().isoformat() + "Z",
    }
    if partner:
        payload["partner"] = partner

    resp = SESSION.post(
        f"{PB_BASE}/api/collections/pocs/records",
        json=payload,
        timeout=10,
    )
    resp.raise_for_status()
    poc = resp.json()
    print(f"[API] Created POC {poc_uid}")
    return poc["id"]


def get_or_create_poc_usecase(poc_id: str, uc_id: str) -> str:
    """Get or create the poc_use_cases link between a POC and a use case."""
    service_login()
    resp = SESSION.get(
        f"{PB_BASE}/api/collections/poc_use_cases/records",
        params={"filter": f'poc="{poc_id}" && use_case="{uc_id}"'},
        timeout=10,
    )
    resp.raise_for_status()
    items = resp.json().get("items", [])
    if items:
        return items[0]["id"]

    resp = SESSION.post(
        f"{PB_BASE}/api/collections/poc_use_cases/records",
        json={"poc": poc_id, "use_case": uc_id},
        timeout=10,
    )
    resp.raise_for_status()
    puc = resp.json()
    print(f"[API] Created poc_use_case for POC {poc_id}, UC {uc_id}")
    return puc["id"]


# ---------------------------------------------------------------------------
# Endpoint: POST /api/daily_update
# ---------------------------------------------------------------------------


@app.route("/api/daily_update", methods=["POST"])
def api_daily_update():
    """
    Daily update for a POC.

    This endpoint:
      - Resolves the SE (users collection)
      - Gets/creates the POC record
      - Updates POC meta (dates, customer, partner, last_daily_update_at)
      - For each use case in `use_cases`:
          * ensures/updates the catalog record in `use_cases`
            (incl. category, is_customer_prep, estimate_hours)
          * ensures the poc_use_cases link exists
          * updates ONLY is_active, is_completed, completed_at on poc_use_cases

    NOTE:
      * Rating and textual feedback are NOT processed here.
        Those are handled by /api/complete_use_case (and optional extra APIs).
    """
    if not check_api_key():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "invalid_json"}), 400

    try:
        service_login()

        se_email = data["se_email"]
        se_id = get_or_create_user_se(se_email)

        poc_uid = data["poc_uid"]
        poc_name = data.get("poc_name", poc_uid)
        customer_name = data.get("customer_name")
        partner = data.get("partner")

        poc_id = get_or_create_poc(
            poc_uid,
            poc_name,
            customer_name,
            se_id,
            partner=partner,
        )

        # --- POC-Felder aktualisieren -----------------------------------
        patch: Dict[str, Any] = {}

        if data.get("prep_start_date"):
            patch["prep_start_date"] = data["prep_start_date"]
        if data.get("poc_start_date"):
            patch["poc_start_date"] = data["poc_start_date"]

        poc_end_plan = data.get("poc_end_date_plan") or data.get("poc_end_date_planned")
        if poc_end_plan:
            patch["poc_end_date_plan"] = poc_end_plan

        if data.get("poc_end_date_actual"):
            patch["poc_end_date_actual"] = data["poc_end_date_actual"]

        if partner:
            patch["partner"] = partner

        # last_daily_update_at immer "now"
        patch["last_daily_update_at"] = datetime.utcnow().isoformat() + "Z"

        if patch:
            SESSION.patch(
                f"{PB_BASE}/api/collections/pocs/records/{poc_id}",
                json=patch,
                timeout=10,
            )

        # --- Use Cases / poc_use_cases -----------------------------------
        use_cases: List[Dict[str, Any]] = data.get("use_cases", [])

        for uc in use_cases:
            code = uc["code"]
            title = uc.get("title")
            version = int(uc.get("version", 1))
            product_family = uc.get("product_family")
            product = uc.get("product")
            description = uc.get("description")
            category = uc.get("category")
            is_customer_prep = uc.get("is_customer_prep")
            estimate_hours = uc.get("estimate_hours")

            # 1) Katalogeintrag im use_cases-Table updaten
            uc_id = get_or_create_usecase(
                code,
                title=title,
                version=version,
                product_family=product_family,
                product=product,
                description=description,
                category=category,
                is_customer_prep=is_customer_prep,
                estimate_hours=estimate_hours,
            )

            # 2) Link POC <-> Use Case
            puc_id = get_or_create_poc_usecase(poc_id, uc_id)

            # 3) Nur Statusfelder im Link-Record aktualisieren
            puc_patch: Dict[str, Any] = {
                "is_active": bool(uc.get("is_active", False)),
                "is_completed": bool(uc.get("is_completed", False)),
            }

            if uc.get("is_completed"):
                puc_patch["completed_at"] = datetime.utcnow().isoformat() + "Z"

            SESSION.patch(
                f"{PB_BASE}/api/collections/poc_use_cases/records/{puc_id}",
                json=puc_patch,
                timeout=10,
            )

        return jsonify({"status": "ok", "poc_uid": poc_uid}), 200

    except requests.HTTPError as e:
        print("[API] HTTPError:", e.response.text)
        return jsonify({"error": "backend_http_error", "details": e.response.text}), 500
    except Exception as e:
        print("[API] Exception:", repr(e))
        return jsonify({"error": "internal_error", "details": str(e)}), 500


# ---------------------------------------------------------------------------
# Endpoint: POST /api/complete_use_case
# ---------------------------------------------------------------------------


# @app.route("/api/complete_use_case", methods=["POST"])
# def api_complete_use_case():
#     """
#     Mark a single use case as completed for a given POC.
#     """
#     if not check_api_key():
#         return jsonify({"error": "unauthorized"}), 401

#     data = request.get_json(silent=True)
#     if not data:
#         return jsonify({"error": "invalid_json"}), 400

#     try:
#         service_login()
#         se_email = data["se_email"]
#         se_id = get_or_create_user_se(se_email)

#         poc_uid = data["poc_uid"]
#         poc_name = data.get("poc_name", poc_uid)
#         customer_name = data.get("customer_name")
#         partner = data.get("partner")

#         poc_id = get_or_create_poc(poc_uid, poc_name, customer_name, se_id, partner=partner)

#         code = data["use_case_code"]
#         version = int(data.get("version", 1))
#         product_family = data.get("product_family")
#         product = data.get("product")
#         description = data.get("description")

#         uc_id = get_or_create_usecase(
#             code,
#             version=version,
#             product_family=product_family,
#             product=product,
#             description=description,
#         )
#         puc_id = get_or_create_poc_usecase(poc_id, uc_id)

#         rating = data.get("rating")
#         text = data.get("text")

#         puc_patch: Dict[str, Any] = {
#             "is_active": True,
#             "is_completed": True,
#             "completed_at": datetime.utcnow().isoformat() + "Z",
#         }
#         if rating is not None:
#             puc_patch["rating"] = int(rating)

#         SESSION.patch(
#             f"{PB_BASE}/api/collections/poc_use_cases/records/{puc_id}",
#             json=puc_patch,
#             timeout=10,
#         )

#         # Optional feedback entry
#         if text or rating is not None:
#             SESSION.post(
#                 f"{PB_BASE}/api/collections/comments/records",
#                 json={
#                     "poc": poc_id,
#                     "use_case": uc_id,
#                     "author": se_id,
#                     "kind": "feedback",
#                     "text": text or "",
#                     "rating": rating,
#                 },
#                 timeout=10,
#             )

#         return jsonify({
#             "status": "ok",
#             "poc_uid": poc_uid,
#             "use_case_code": code,
#             "version": version,
#         }), 200

#     except requests.HTTPError as e:
#         print("[API] HTTPError:", e.response.text)
#         return jsonify({"error": "backend_http_error", "details": e.response.text}), 500
#     except Exception as e:
#         print("[API] Exception:", repr(e))
#         return jsonify({"error": "internal_error", "details": str(e)}), 500

@app.route("/api/mark_use_case_completed", methods=["POST"])
def api_mark_use_case_completed():
    """
    Mark a single use case as completed for a given POC.
    Does NOT touch rating or comments.
    """
    if not check_api_key():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "invalid_json"}), 400

    try:
        service_login()

        se_email = data["se_email"]
        se_id = get_or_create_user_se(se_email)

        poc_uid = data["poc_uid"]
        poc_name = data.get("poc_name", poc_uid)
        customer_name = data.get("customer_name")
        partner = data.get("partner")

        poc_id = get_or_create_poc(
            poc_uid,
            poc_name,
            customer_name,
            se_id,
            partner=partner,
        )

        code = data["use_case_code"]
        version = int(data.get("version", 1))
        product_family = data.get("product_family")
        product = data.get("product")
        description = data.get("description")

        uc_id = get_or_create_usecase(
            code,
            version=version,
            product_family=product_family,
            product=product,
            description=description,
        )
        puc_id = get_or_create_poc_usecase(poc_id, uc_id)

        puc_patch: Dict[str, Any] = {
            "is_active": True,
            "is_completed": True,
            "completed_at": datetime.utcnow().isoformat() + "Z",
        }

        SESSION.patch(
            f"{PB_BASE}/api/collections/poc_use_cases/records/{puc_id}",
            json=puc_patch,
            timeout=10,
        )

        return jsonify({
            "status": "ok",
            "poc_uid": poc_uid,
            "use_case_code": code,
            "version": version,
        }), 200

    except requests.HTTPError as e:
        print("[API] HTTPError:", e.response.text)
        return jsonify({"error": "backend_http_error", "details": e.response.text}), 500
    except Exception as e:
        print("[API] Exception:", repr(e))
        return jsonify({"error": "internal_error", "details": str(e)}), 500

@app.route("/api/rate_use_case", methods=["POST"])
def api_rate_use_case():
    """
    Set rating (and optional feedback text) for a specific POC/use case.

    - Updates only `rating` on `poc_use_cases`
    - Optionally creates a `comments` record (kind="feedback")
    """
    if not check_api_key():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "invalid_json"}), 400

    try:
        service_login()

        se_email = data["se_email"]
        se_id = get_or_create_user_se(se_email)

        poc_uid = data["poc_uid"]
        poc_name = data.get("poc_name", poc_uid)
        customer_name = data.get("customer_name")
        partner = data.get("partner")

        poc_id = get_or_create_poc(
            poc_uid,
            poc_name,
            customer_name,
            se_id,
            partner=partner,
        )

        code = data["use_case_code"]
        version = int(data.get("version", 1))
        product_family = data.get("product_family")
        product = data.get("product")
        description = data.get("description")

        uc_id = get_or_create_usecase(
            code,
            version=version,
            product_family=product_family,
            product=product,
            description=description,
        )
        puc_id = get_or_create_poc_usecase(poc_id, uc_id)

        rating = data.get("rating")
        if rating is None:
            return jsonify({"error": "missing_rating"}), 400

        text = data.get("text", "")

        # Nur Rating anfassen
        SESSION.patch(
            f"{PB_BASE}/api/collections/poc_use_cases/records/{puc_id}",
            json={"rating": int(rating)},
            timeout=10,
        )

        # Optionaler Kommentar
        if text:
            SESSION.post(
                f"{PB_BASE}/api/collections/comments/records",
                json={
                    "poc": poc_id,
                    "use_case": uc_id,
                    "author": se_id,
                    "kind": "feedback",
                    "text": text,
                    "rating": int(rating),
                },
                timeout=10,
            )

        return jsonify({
            "status": "ok",
            "poc_uid": poc_uid,
            "use_case_code": code,
            "version": version,
            "rating": int(rating),
        }), 200

    except requests.HTTPError as e:
        print("[API] HTTPError:", e.response.text)
        return jsonify({"error": "backend_http_error", "details": e.response.text}), 500
    except Exception as e:
        print("[API] Exception:", repr(e))
        return jsonify({"error": "internal_error", "details": str(e)}), 500


# ---------------------------------------------------------------------------
# Endpoint: POST /api/comment
# ---------------------------------------------------------------------------


@app.route("/api/comment", methods=["POST"])
def api_comment():
    """
    Add feedback or a question for a specific POC/use case.

    - Creates a `comments` record linked via `poc_use_case`
    - Optional rating updates `poc_use_cases.rating` (not stored on comments)
    """
    if not check_api_key():
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "invalid_json"}), 400

    try:
        service_login()

        se_email = data["se_email"]
        se_id = get_or_create_user_se(se_email)

        poc_uid = data["poc_uid"]
        poc_name = data.get("poc_name", poc_uid)
        customer_name = data.get("customer_name")
        partner = data.get("partner")

        poc_id = get_or_create_poc(
            poc_uid,
            poc_name,
            customer_name,
            se_id,
            partner=partner,
        )

        code = data["use_case_code"]
        version = int(data.get("version", 1))
        product_family = data.get("product_family")
        product = data.get("product")
        description = data.get("description")

        uc_id = get_or_create_usecase(
            code,
            version=version,
            product_family=product_family,
            product=product,
            description=description,
        )

        # ensure poc_use_case link exists
        puc_id = get_or_create_poc_usecase(poc_id, uc_id)

        kind = data.get("kind", "feedback")
        if kind not in ("feedback", "question"):
            return jsonify({
                "error": "invalid_kind",
                "details": "kind must be 'feedback' or 'question'"
            }), 400

        rating = data.get("rating")
        text = data.get("text", "")

        # Optional: Rating auch hier direkt auf poc_use_cases schreiben
        if rating is not None:
            SESSION.patch(
                f"{PB_BASE}/api/collections/poc_use_cases/records/{puc_id}",
                json={"rating": int(rating)},
                timeout=10,
            )

        payload: Dict[str, Any] = {
            "poc": poc_id,
            "poc_use_case": puc_id,
            "author": se_id,
            "kind": kind,
            "text": text,
        }

        resp = SESSION.post(
            f"{PB_BASE}/api/collections/comments/records",
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        comment = resp.json()

        return jsonify({"status": "ok", "comment_id": comment["id"]}), 200

    except requests.HTTPError as e:
        print("[API] HTTPError:", e.response.text)
        return jsonify({"error": "backend_http_error", "details": e.response.text}), 500
    except Exception as e:
        print("[API] Exception:", repr(e))
        return jsonify({"error": "internal_error", "details": str(e)}), 500


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("API_PORT", "8000"))

    # connectivity / auth check
    try:
        service_login()
        print(f"[API] Service login OK as {SERVICE_EMAIL}")

        r = SESSION.get(f"{PB_BASE}/api/collections", timeout=10)
        r.raise_for_status()
        data = r.json()

        coll_names: List[str] = []
        if isinstance(data, list):
            coll_names = [c.get("name", "?") for c in data]
        elif isinstance(data, dict):
            items = data.get("items", [])
            coll_names = [c.get("name", "?") for c in items]

        print(f"[API] PocketBase connectivity OK, collections: {coll_names}")
    except Exception as e:
        print("[API] WARNING: PocketBase connectivity check failed:", repr(e))

    print(f"[API] Starting POC public API on 0.0.0.0:{port}, PB_BASE={PB_BASE}")
    app.run(host="0.0.0.0", port=port)
