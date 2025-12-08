#!/usr/bin/env python3
"""
POC Portal – Public API Backend (Python)

Stellt 3 Endpunkte bereit:

1) POST /api/daily_update
   - Tägliches Update eines POC inkl. aller Use Cases
   - Legt SE-User, POC, Use-Cases, Poc-UseCases, Comments, Daily-Snapshot an/aktualisiert.

2) POST /api/complete_use_case
   - Markiert einen einzelnen Use Case als abgeschlossen
   - Optional Rating + Text als Feedback

3) POST /api/comment
   - Fügt Feedback oder Question zu einem Use Case hinzu
   - Mehrfach pro POC/Use Case möglich

Konfiguration via Environment:

  PB_BASE           (z.B. http://127.0.0.1:8090)
  PB_API_EMAIL      (Service-User, z.B. manager@example.com)
  PB_API_PASSWORD   (Passwort)
  API_PORT          (optional, Default: 8000)
  API_SHARED_SECRET (optional; wenn gesetzt, muss Header X-Api-Key passen)
"""

import os
import json
from datetime import datetime, date
from typing import Optional, Dict, Any, List

import requests
from flask import Flask, request, jsonify

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------

PB_BASE = os.getenv("PB_BASE", "http://127.0.0.1:8090")
SERVICE_EMAIL = os.getenv("PB_API_EMAIL", "manager@example.com")
SERVICE_PASSWORD = os.getenv("PB_API_PASSWORD", "changeme123")
API_SHARED_SECRET = os.getenv("API_SHARED_SECRET")

SESSION = requests.Session()
AUTH_TOKEN: Optional[str] = None

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Helper: Auth, API-Key, PocketBase-Access
# ---------------------------------------------------------------------------

def service_login():
    """Loggt den Service-User ein und setzt den Bearer-Token."""
    global AUTH_TOKEN
    if AUTH_TOKEN:
        return
    resp = SESSION.post(
        f"{PB_BASE}/api/collections/users/auth-with-password",
        json={"identity": SERVICE_EMAIL, "password": SERVICE_PASSWORD},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    token = data["token"]
    AUTH_TOKEN = token
    SESSION.headers["Authorization"] = f"Bearer {token}"
    print(f"[API] Service logged in as {SERVICE_EMAIL}")


def check_api_key() -> bool:
    """Optionaler API-Key Schutz."""
    if not API_SHARED_SECRET:
        return True
    hdr = request.headers.get("X-Api-Key")
    return hdr == API_SHARED_SECRET


def get_or_create_user_se(email: str) -> str:
    """SE-User nach E-Mail holen oder neu anlegen."""
    service_login()
    resp = SESSION.get(
        f"{PB_BASE}/api/collections/users/records",
        params={"filter": f'email="{email}"'},
        timeout=10,
    )
    resp.raise_for_status()
    items = resp.json().get("items", [])
    if items:
        return items[0]["id"]

    pwd = "changeme123"
    resp = SESSION.post(
        f"{PB_BASE}/api/collections/users/records",
        json={
            "email": email,
            "password": pwd,
            "passwordConfirm": pwd,
            "role": "se",
            "emailVisibility": True,
        },
        timeout=10,
    )
    resp.raise_for_status()
    u = resp.json()
    print(f"[API] Created SE user {email}")
    return u["id"]


def get_or_create_usecase(
    code: str,
    title: Optional[str] = None,
    version: int = 1,
    product_family: Optional[str] = None,
    product: Optional[str] = None,
) -> str:
    """Use Case (inkl. Version) holen oder anlegen."""
    service_login()
    filter_expr = f'code="{code}" && version={int(version)}'
    resp = SESSION.get(
        f"{PB_BASE}/api/collections/use_cases/records",
        params={"filter": filter_expr},
        timeout=10,
    )
    resp.raise_for_status()
    items = resp.json().get("items", [])
    if items:
        return items[0]["id"]

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
    """POC nach UID holen oder anlegen."""
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
    """Verknüpfung POC <-> UseCase (poc_use_cases) holen oder anlegen."""
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
    Volles Daily-Update für einen POC.

    Erwartetes JSON (Beispiel):

    {
      "se_email": "jens.sabitzer@cyberark.com",
      "poc_uid": "ACME-POC-1",
      "poc_name": "ACME – Demo POC",
      "customer_name": "ACME Bank",
      "partner": "BigPartner GmbH",
      "prep_start_date": "2025-11-20",
      "poc_start_date": "2025-11-22",
      "poc_end_date_plan": "2025-12-01",
      "poc_end_date_actual": "2025-11-30",    # optional
      "use_cases": [
        {
          "code": "Dashboard",
          "title": "Dashboard",
          "version": 1,
          "product_family": "MIM",
          "product": "Certificate Manager",
          "is_active": true,
          "is_completed": false,
          "is_customer_prep": false,
          "estimate_hours": 4,
          "rating": 4,
          "feedback": ["Customer likes the overview."],
          "questions": ["Can we add SAP-specific KPIs?"]
        }
      ]
    }
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

        poc_id = get_or_create_poc(poc_uid, poc_name, customer_name, se_id, partner=partner)

        # POC-Felder updaten
        patch: Dict[str, Any] = {}
        if data.get("prep_start_date"):
            patch["prep_start_date"] = data["prep_start_date"]
        if data.get("poc_start_date"):
            patch["poc_start_date"] = data["poc_start_date"]
        # akzeptiere sowohl poc_end_date_plan als auch poc_end_date_planned
        poc_end_plan = data.get("poc_end_date_plan") or data.get("poc_end_date_planned")
        if poc_end_plan:
            patch["poc_end_date_plan"] = poc_end_plan
        if data.get("poc_end_date_actual"):
            patch["poc_end_date_actual"] = data["poc_end_date_actual"]
        if partner:
            patch["partner"] = partner

        patch["last_daily_update_at"] = datetime.utcnow().isoformat() + "Z"

        if patch:
            SESSION.patch(
                f"{PB_BASE}/api/collections/pocs/records/{poc_id}",
                json=patch,
                timeout=10,
            )

        # Snapshot in daily_status
        SESSION.post(
            f"{PB_BASE}/api/collections/daily_status/records",
            json={
                "poc": poc_id,
                "se": se_id,
                "snapshot_date": date.today().isoformat(),
                "payload": json.dumps(data),
            },
            timeout=10,
        )

        resp = SESSION.get(
            f"{PB_BASE}/api/collections/poc_use_cases/records",
            params={"filter": f'poc="{poc_id}"', "perPage": 500},
            timeout=10,
        )
        resp.raise_for_status()
        existing_pucs = resp.json().get("items", [])
        print(f"[API] Found {len(existing_pucs)} existing poc_use_cases for POC {poc_id}")

    for puc in existing_pucs:
        print(f"[API]   - {puc['id']}: is_active={puc.get('is_active')}")
        if puc.get("is_active"):
            resp_patch = SESSION.patch(
                f"{PB_BASE}/api/collections/poc_use_cases/records/{puc['id']}",
                json={"is_active": False},
                timeout=10,
            )
            print(f"[API]   -> Deactivated, status={resp_patch.status_code}")


        for puc in existing_pucs:
            if puc.get("is_active"):
                SESSION.patch(
                    f"{PB_BASE}/api/collections/poc_use_cases/records/{puc['id']}",
                    json={"is_active": False},
                    timeout=10,
                )

        # Use Cases
        use_cases: List[Dict[str, Any]] = data.get("use_cases", [])
        for uc in use_cases:
            code = uc["code"]
            title = uc.get("title")
            version = int(uc.get("version", 1))
            product_family = uc.get("product_family")
            product = uc.get("product")

            uc_id = get_or_create_usecase(code, title, version, product_family, product)
            puc_id = get_or_create_poc_usecase(poc_id, uc_id)

            puc_patch: Dict[str, Any] = {
                "is_active": bool(uc.get("is_active", False)),
                "is_completed": bool(uc.get("is_completed", False)),
                "is_customer_prep": bool(uc.get("is_customer_prep", False)),
            }
            if uc.get("estimate_hours") is not None:
                puc_patch["estimate_hours"] = float(uc["estimate_hours"])

            # completed_at setzen, wenn abgeschlossen
            if uc.get("is_completed"):
                puc_patch["completed_at"] = datetime.utcnow().isoformat() + "Z"

            rating = uc.get("rating")
            if rating is not None:
                puc_patch["rating"] = int(rating)

            SESSION.patch(
                f"{PB_BASE}/api/collections/poc_use_cases/records/{puc_id}",
                json=puc_patch,
                timeout=10,
            )

            # Feedback & Questions als comments (mehrfach möglich)
            for fb in uc.get("feedback", []):
                if fb:
                    SESSION.post(
                        f"{PB_BASE}/api/collections/comments/records",
                        json={
                            "poc": poc_id,
                            "use_case": uc_id,
                            "author": se_id,
                            "kind": "feedback",
                            "text": fb,
                            "rating": rating,
                        },
                        timeout=10,
                    )

            for q in uc.get("questions", []):
                if q:
                    SESSION.post(
                        f"{PB_BASE}/api/collections/comments/records",
                        json={
                            "poc": poc_id,
                            "use_case": uc_id,
                            "author": se_id,
                            "kind": "question",
                            "text": q,
                        },
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

@app.route("/api/complete_use_case", methods=["POST"])
def api_complete_use_case():
    """
    Markiert einen einzelnen Use Case als abgeschlossen.

    Erwartetes JSON:
    {
      "se_email": "jens.sabitzer@cyberark.com",
      "poc_uid": "ACME-POC-1",
      "poc_name": "ACME – Demo POC",          # optional
      "customer_name": "ACME Bank",          # optional
      "partner": "BigPartner GmbH",          # optional
      "use_case_code": "Dashboard",
      "version": 1,                          # optional, default 1
      "product_family": "MIM",               # optional
      "product": "Certificate Manager",      # optional
      "rating": 5,                           # optional
      "text": "Completed, everything fine."  # optional (als Feedback)
    }
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

        poc_id = get_or_create_poc(poc_uid, poc_name, customer_name, se_id, partner=partner)

        code = data["use_case_code"]
        version = int(data.get("version", 1))
        product_family = data.get("product_family")
        product = data.get("product")

        uc_id = get_or_create_usecase(code, version=version, product_family=product_family, product=product)
        puc_id = get_or_create_poc_usecase(poc_id, uc_id)

        rating = data.get("rating")
        text = data.get("text")

        puc_patch: Dict[str, Any] = {
            "is_active": True,
            "is_completed": True,
            "completed_at": datetime.utcnow().isoformat() + "Z",
        }
        if rating is not None:
            puc_patch["rating"] = int(rating)

        SESSION.patch(
            f"{PB_BASE}/api/collections/poc_use_cases/records/{puc_id}",
            json=puc_patch,
            timeout=10,
        )

        # Optionales Feedback als Comment
        if text or rating is not None:
            SESSION.post(
                f"{PB_BASE}/api/collections/comments/records",
                json={
                    "poc": poc_id,
                    "use_case": uc_id,
                    "author": se_id,
                    "kind": "feedback",
                    "text": text or "",
                    "rating": rating,
                },
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


# ---------------------------------------------------------------------------
# Endpoint: POST /api/comment  (Feedback oder Question)
# ---------------------------------------------------------------------------

@app.route("/api/comment", methods=["POST"])
def api_comment():
    """
    Fügt Feedback oder Question für einen Use Case hinzu.

    Erwartetes JSON:
    {
      "se_email": "jens.sabitzer@cyberark.com",
      "poc_uid": "ACME-POC-1",
      "poc_name": "ACME – Demo POC",         # optional
      "customer_name": "ACME Bank",         # optional
      "partner": "BigPartner GmbH",         # optional
      "use_case_code": "Dashboard",
      "version": 1,                         # optional, default 1
      "kind": "feedback" | "question",
      "rating": 4,                          # optional (v.a. bei feedback)
      "text": "Customer likes it..."        # optional
    }

    Mehrfach pro POC/Use Case möglich.
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

        poc_id = get_or_create_poc(poc_uid, poc_name, customer_name, se_id, partner=partner)

        code = data["use_case_code"]
        version = int(data.get("version", 1))
        product_family = data.get("product_family")
        product = data.get("product")

        uc_id = get_or_create_usecase(code, version=version, product_family=product_family, product=product)

        # sicherstellen, dass es die poc_use_case-Verknüpfung gibt
        get_or_create_poc_usecase(poc_id, uc_id)

        kind = data.get("kind", "feedback")
        if kind not in ("feedback", "question"):
            return jsonify({"error": "invalid_kind", "details": "kind must be 'feedback' or 'question'"}), 400

        rating = data.get("rating")
        text = data.get("text", "")

        payload: Dict[str, Any] = {
            "poc": poc_id,
            "use_case": uc_id,
            "author": se_id,
            "kind": kind,
            "text": text,
        }
        if rating is not None:
            payload["rating"] = int(rating)

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
    print(f"[API] Starting POC public API on 0.0.0.0:{port}, PB_BASE={PB_BASE}")
    app.run(host="0.0.0.0", port=port)
