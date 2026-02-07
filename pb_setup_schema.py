#
# poc_use_cases is missing the id = @request.auth.id for list and search and view
#
#



#!/usr/bin/env python3
"""
PocketBase Schema Setup Script

Dieses Script:
- loggt sich als Admin in PocketBase ein
- ergänzt die Auth-Collection "users" um:
  - role (select: se / manager / ae / pm)
  - displayName (text)
- legt folgende Collections an (falls nicht vorhanden) und ergänzt Felder:
  - use_cases
  - pocs
  - ae_se_map
  - poc_use_cases
  - comments
  - manager_se_map

Konfiguration über Umgebungsvariablen:
  PB_BASE           (z.B. http://127.0.0.1:8090)
  PB_ADMIN_EMAIL    (Admin-E-Mail aus PocketBase)
  PB_ADMIN_PASSWORD (Admin-Passwort)
"""

import os
import sys
import requests

PB_BASE = os.getenv("PB_BASE", "http://127.0.0.1:8090")
ADMIN_EMAIL = os.getenv("PB_ADMIN_EMAIL")
ADMIN_PASSWORD = os.getenv("PB_ADMIN_PASSWORD")

if not ADMIN_EMAIL or not ADMIN_PASSWORD:
    print("Bitte PB_ADMIN_EMAIL und PB_ADMIN_PASSWORD als Umgebungsvariablen setzen.")
    sys.exit(1)

session = requests.Session()

SE_ONLY_RULE = '(@request.auth.role = "se" || @request.auth.role = "manager")'
AUTH_ONLY_RULE = '@request.auth.id != ""'


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def admin_login():
    """Meldet sich als Admin an und setzt den Bearer-Token im Session-Header."""
    resp = session.post(
        f"{PB_BASE}/api/collections/_superusers/auth-with-password",
        json={"identity": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    token = data["token"]
    session.headers["Authorization"] = f"Bearer {token}"
    print(f"[OK] Admin-Login für {ADMIN_EMAIL}")



def get_all_collections():
    """Liest alle Collections und gibt ein Dict name -> collection zurück."""
    resp = session.get(f"{PB_BASE}/api/collections", timeout=10)
    resp.raise_for_status()
    items = resp.json().get("items", [])
    by_name = {c["name"]: c for c in items}
    return by_name


def get_collection(name, collections=None):
    """Gibt Collection-Objekt nach Name zurück oder None."""
    if collections is None:
        collections = get_all_collections()
    return collections.get(name)


def ensure_field(collection, field_def):
    """
    Stellt sicher, dass ein Feld mit diesem Namen in der Collection existiert.
    Holt dabei IMMER zuerst das aktuelle Fields-Array vom Server (PB 0.34+).
    """
    name = field_def["name"]

    # Frischen Stand vom Server holen
    resp = session.get(f"{PB_BASE}/api/collections/{collection['id']}", timeout=10)
    resp.raise_for_status()
    fresh = resp.json()

    # PB 0.34 benutzt "fields"
    fields = fresh.get("fields", [])

    if any(f.get("name") == name for f in fields):
        print(f"  - Feld '{name}' existiert bereits in Collection '{fresh['name']}'")
        return

    # neues Feld anhängen
    fields.append(field_def)

    # Nur "fields" patchen – Name/Type/System nicht anfassen (wichtig für _pb_users_auth_)
    patch_body = {"fields": fields}

    resp = session.patch(
        f"{PB_BASE}/api/collections/{fresh['id']}",
        json=patch_body,
        timeout=10,
    )

    if resp.status_code >= 400:
        print(f"[ERROR] Feld '{name}' konnte in Collection '{fresh['name']}' nicht angelegt.")
        print(f"        Status: {resp.status_code}")
        print(f"        Response: {resp.text}")
        resp.raise_for_status()

    print(f"  - Feld '{name}' zu Collection '{fresh['name']}' hinzugefügt")



def create_collection_if_missing(name, ctype, fields):
    """
    Legt eine neue Collection an, wenn sie noch nicht existiert.
    fields = Liste von Field-Def-Dicts (schema)
    """
    collections = get_all_collections()
    if name in collections:
        print(f"[SKIP] Collection '{name}' existiert bereits.")
        return collections[name]

    payload = {
        "name": name,
        "type": ctype,  # "base" oder "auth"
        "fields": fields,
        # Regeln: erstmal alles offen; kannst du später einschränken
        "listRule": None,
        "viewRule": None,
        "createRule": None,
        "updateRule": None,
        "deleteRule": None,
        "options": {},
    }
    resp = session.post(f"{PB_BASE}/api/collections", json=payload, timeout=10)
    resp.raise_for_status()
    created = resp.json()
    print(f"[OK] Collection '{name}' erstellt.")
    return created


# ---------------------------------------------------------------------------
# Feld-Definitionen (Generisch)
# ---------------------------------------------------------------------------

def text_field(name, required=False, unique=False):
    return {
        "name": name,
        "type": "text",
        "required": required,
        "presentable": False,
        "unique": unique,
        # TextField options (flattened, v0.23+)
        "min": None,
        "max": None,
        "pattern": "",
    }


def number_field(name, required=False):
    return {
        "name": name,
        "type": "number",
        "required": required,
        "presentable": False,
        "unique": False,
        # NumberField options
        "min": None,
        "max": None,
        "noDecimal": False,
    }


def bool_field(name, required=False):
    return {
        "name": name,
        "type": "bool",
        "required": required,
        "presentable": False,
        "unique": False,
        # BoolField has no extra options
    }


def date_field(name, required=False):
    return {
        "name": name,
        "type": "date",
        "required": required,
        "presentable": False,
        "unique": False,
        # DateField options
        "min": "",
        "max": "",
    }


def select_field(name, values, required=False, maxSelect=1):
    return {
        "name": name,
        "type": "select",
        "required": required,
        "presentable": False,
        "unique": False,
        # SelectField options (flattened!)
        "maxSelect": maxSelect,
        "values": values,  # ["se","manager","ae","pm"]
    }


def relation_field(name, target_collection_id, maxSelect=1, cascade=False):
    return {
        "name": name,
        "type": "relation",
        "required": False,
        "presentable": False,
        "unique": False,
        # RelationField options
        "collectionId": target_collection_id,
        "cascadeDelete": cascade,
        "minSelect": None,
        "maxSelect": maxSelect,
        "displayFields": [],
    }


def json_field(name, required=False):
    return {
        "name": name,
        "type": "json",
        "required": required,
        "presentable": False,
        "unique": False,
        # JSONField has no extra options in v0.34
    }

def autodate_field(name, onCreate=True, onUpdate=True):
    return {
        "name": name,
        "type": "autodate",
        "required": False,
        "presentable": False,
        "unique": False,
        "onCreate": onCreate,
        "onUpdate": onUpdate,
    }

# ---------------------------------------------------------------------------
# Setup-Funktionen für jede Collection
# ---------------------------------------------------------------------------

def update_collection_rules(collection_name, **rules):
    """
    Aktualisiert Zugriffsregeln (listRule, viewRule, createRule, updateRule, deleteRule)
    für eine bestehende Collection, ohne das Schema anzufassen.
    """
    collections = get_all_collections()
    coll = collections.get(collection_name)
    if not coll:
        raise RuntimeError(f"Collection '{collection_name}' nicht gefunden.")

    payload = {}
    for key in ("listRule", "viewRule", "createRule", "updateRule", "deleteRule"):
        if key in rules:
            # Nur setzen, wenn sich der Wert tatsächlich ändert
            if coll.get(key) != rules[key]:
                payload[key] = rules[key]

    if not payload:
        print(f"[SKIP] Regeln für '{collection_name}' sind bereits wie gewünscht.")
        return

    resp = session.patch(
        f"{PB_BASE}/api/collections/{coll['id']}",
        json=payload,
        timeout=10,
    )

    if resp.status_code >= 400:
        print(f"[ERROR] Regeln für '{collection_name}' konnten nicht aktualisiert werden.")
        print(f"        Status: {resp.status_code}")
        print(f"        Response: {resp.text}")
        resp.raise_for_status()

    print(f"[OK] Regeln für Collection '{collection_name}' aktualisiert: {', '.join(payload.keys())}")


def setup_users_fields():
    """
    Ergänzt in der bestehenden Auth-Collection 'users' die Felder:
      - role (select: se/manager/ae/pm)
      - displayName (text)
      - region (text)
    """
    collections = get_all_collections()
    users = collections.get("users")
    if not users:
        raise RuntimeError("Collection 'users' existiert nicht – bitte prüfen, ob PocketBase korrekt initialisiert ist.")

    print("[SETUP] users – zusätzliche Felder")

    role_field = select_field("role", ["se", "manager", "ae", "pm"], required=False, maxSelect=1)
    display_field = text_field("displayName", required=False, unique=False)
    region_field = text_field("region", required=False, unique=False)

    ensure_field(users, role_field)
    ensure_field(users, display_field)
    ensure_field(users, region_field)




def setup_use_cases():
    """
    use_cases:
      - code (text)
      - title (text)
      - description (text)
      - version (number, required)
      - product_family (text)
      - product (text)
      - category (text) 
      - estimate_hours (number)
      - is_customer_prep (bool)
      - author (text)
    """
    print("[SETUP] use_cases")
    fields = [
        text_field("code", required=True, unique=False),
        text_field("title", required=True, unique=False),
        text_field("description", required=False, unique=False),
        number_field("version", required=True),
        text_field("product_family", required=False, unique=False),
        text_field("product", required=False, unique=False),
        text_field("category", required=False),
        number_field("estimate_hours", required=False),
        bool_field("is_customer_prep", required=False),
        text_field("author", required=False, unique=False),
    ]
    coll = create_collection_if_missing("use_cases", "base", fields)
    collections = get_all_collections()
    coll = collections["use_cases"]
    for f in fields:
        ensure_field(coll, f)

    # Access rules for use_cases – alle Auth-User sehen, nur Manager/PM pflegen
    use_cases_list_view_rule = '@request.auth.id != ""'
    use_cases_update_rule = (
        '@request.auth.role = "manager" || '
        '@request.auth.role = "pm"'
    )

    update_collection_rules(
        "use_cases",
        listRule=AUTH_ONLY_RULE,
        viewRule=AUTH_ONLY_RULE,
        createRule=SE_ONLY_RULE,
        updateRule=SE_ONLY_RULE,
        deleteRule=SE_ONLY_RULE,
    )



def setup_pocs():
    """
    pocs:
      - poc_uid (text, unique)
      - name (text)
      - customer_name (text)
      - partner (text)
      - product (text)
      - se (relation -> users)
      - prep_start_date (date)
      - poc_start_date (date)
      - poc_end_date_plan (date)
      - poc_end_date_actual (date)
      - is_active (bool)
      - is_completed (bool)
      - last_daily_update_at (date)
      - completion_date_auto (date)
      - risk_status (select: on_track, at_risk, overdue)
      - technical_result (select: unknown, win, loss, other)
      - commercial_result (select: unknown, now_customer, lost, no_decision, not_correct_qualified, other)
      - se_comment (text)
      - aeb (text)
      - deregistered_at
    """
    print("[SETUP] pocs")

    collections = get_all_collections()
    users = collections.get("users")
    if not users:
        raise RuntimeError("Collection 'users' nicht gefunden (für pocs.se Relation).")

    fields = [
        text_field("poc_uid", required=True, unique=True),
        text_field("name", required=True, unique=False),
        text_field("customer_name", required=False, unique=False),
        text_field("partner", required=False, unique=False),
        text_field("product", required=False, unique=False),
        relation_field("se", users["id"], maxSelect=1),
        date_field("prep_start_date", required=False),
        date_field("poc_start_date", required=False),
        date_field("poc_end_date_plan", required=False),
        date_field("poc_end_date_actual", required=False),
        bool_field("is_active", required=False),
        bool_field("is_completed", required=False),
        date_field("last_daily_update_at", required=False),
        date_field("completion_date_auto", required=False),
        select_field("risk_status", ["on_track", "at_risk", "overdue"], required=False),
        select_field("technical_result", ["unknown", "win", "loss", "other"], required=False),
        select_field("commercial_result", ["unknown", "now_customer", "lost", "no_decision", "not_correct_qualified", "other"], required=False),
        text_field("se_comment", required=False, unique=False),
        text_field("aeb", required=False, unique=False),
        date_field("deregistered_at", required=False),
        
    ]

    coll = create_collection_if_missing("pocs", "base", fields)
    # Felder nachziehen, falls Collection schon existierte
    collections = get_all_collections()
    coll = collections["pocs"]
    for f in fields:
        ensure_field(coll, f)

    # Global policy:
    # - any logged-in user can see POCs
    # - only SEs can create/update/delete (field-level exception for AE on `aeb` needs a hook)
    update_collection_rules(
        "pocs",
        listRule=AUTH_ONLY_RULE,
        viewRule=AUTH_ONLY_RULE,
        createRule=SE_ONLY_RULE,
        updateRule=SE_ONLY_RULE,
        deleteRule=SE_ONLY_RULE,
    )



def setup_ae_se_map():
    """
    ae_se_map:
      - ae (relation -> users)
      - se (relation -> users)
    """
    print("[SETUP] ae_se_map")

    collections = get_all_collections()
    users = collections.get("users")
    if not users:
        raise RuntimeError("Collection 'users' nicht gefunden (für ae_se_map Relation).")

    fields = [
        relation_field("ae", users["id"], maxSelect=1),
        relation_field("se", users["id"], maxSelect=1),
    ]

    coll = create_collection_if_missing("ae_se_map", "base", fields)
    collections = get_all_collections()
    coll = collections["ae_se_map"]
    for f in fields:
        ensure_field(coll, f)

    # role_mgr_pm = '@request.auth.role = "manager" || @request.auth.role = "pm"'
    update_collection_rules(
        "ae_se_map",
        listRule=AUTH_ONLY_RULE,
        viewRule=AUTH_ONLY_RULE,
        createRule=SE_ONLY_RULE,
        updateRule=SE_ONLY_RULE,
        deleteRule=SE_ONLY_RULE,
    )



def setup_poc_use_cases():
    """
    poc_use_cases:
      - poc (relation -> pocs)
      - use_case (relation -> use_cases)
      - is_active (bool)
      - is_completed (bool)
      - completed_at (date)
      - rating (number)
      - order (number) 
    """
    print("[SETUP] poc_use_cases")

    collections = get_all_collections()
    pocs = collections.get("pocs")
    use_cases = collections.get("use_cases")
    if not pocs or not use_cases:
        raise RuntimeError("Collections 'pocs' und/oder 'use_cases' fehlen (für poc_use_cases).")

    fields = [
        relation_field("poc", pocs["id"], maxSelect=1),
        relation_field("use_case", use_cases["id"], maxSelect=1),
        bool_field("is_active", required=False),
        bool_field("is_completed", required=False),
        date_field("completed_at", required=False),
        number_field("rating", required=False),
        number_field("order", required=False),
    ]

    coll = create_collection_if_missing("poc_use_cases", "base", fields)
    collections = get_all_collections()
    coll = collections["poc_use_cases"]
    for f in fields:
        ensure_field(coll, f)

    update_collection_rules(
        "poc_use_cases",
        listRule=AUTH_ONLY_RULE,
        viewRule=AUTH_ONLY_RULE,
        createRule=SE_ONLY_RULE,
        updateRule=SE_ONLY_RULE,
        deleteRule=SE_ONLY_RULE,
    )



def setup_comments():
    """
    comments:
      - poc (relation -> pocs)
      - poc_use_case (relation -> poc_use_cases, optional)
      - author (relation -> users)
      - kind (text)
      - text (text)
      - created (autodate)
      - updated (autodate)
    """
    print("[SETUP] comments")

    collections = get_all_collections()
    pocs = collections.get("pocs")
    poc_use_cases = collections.get("poc_use_cases")
    users = collections.get("users")

    if not pocs or not poc_use_cases or not users:
        raise RuntimeError("Collections 'pocs', 'poc_use_cases' oder 'users' fehlen (für comments).")

    fields = [
        relation_field("poc", pocs["id"], maxSelect=1),
        relation_field("poc_use_case", poc_use_cases["id"], maxSelect=1),
        relation_field("author", users["id"], maxSelect=1),
        text_field("kind", required=False, unique=False),
        text_field("text", required=False, unique=False),
        autodate_field("created", onCreate=True, onUpdate=False),
        autodate_field("updated", onCreate=True, onUpdate=True),
    ]

    coll = create_collection_if_missing("comments", "base", fields)
    collections = get_all_collections()
    coll = collections["comments"]
    for f in fields:
        ensure_field(coll, f)

    # Comments:
    # - any logged-in user can see comments
    # - only SEs can create/update/delete (per global policy)
    update_collection_rules(
        "comments",
        listRule=AUTH_ONLY_RULE,
        viewRule=AUTH_ONLY_RULE,
        createRule=SE_ONLY_RULE,
        updateRule=SE_ONLY_RULE,
        deleteRule=SE_ONLY_RULE,
    )



def setup_manager_se_map():
    """
    manager_se_map:
      - manager (relation -> users)
      - se (relation -> users)
    """
    print("[SETUP] manager_se_map")

    collections = get_all_collections()
    users = collections.get("users")
    if not users:
        raise RuntimeError("Collection 'users' nicht gefunden (für manager_se_map Relation).")

    fields = [
        relation_field("manager", users["id"], maxSelect=1),
        relation_field("se", users["id"], maxSelect=1),
    ]

    coll = create_collection_if_missing("manager_se_map", "base", fields)
    collections = get_all_collections()
    coll = collections["manager_se_map"]
    for f in fields:
        ensure_field(coll, f)

    update_collection_rules(
        "manager_se_map",
        listRule=AUTH_ONLY_RULE,
        viewRule=AUTH_ONLY_RULE,
        createRule=SE_ONLY_RULE,
        updateRule=SE_ONLY_RULE,
        deleteRule=SE_ONLY_RULE,
    )



def setup_feature_requests():
    """
    feature_requests:
      - source (select: productboard, custom, jira, other)
      - external_id (text)
      - external_url (text)
      - title (text, required)
      - description (text)
      - status (select)
      - release_version (text)
      - release_date (date)
      - timeframe (text)
      - product (text)
      - priority (select)
      - last_synced_at (date)
    """
    print("[SETUP] feature_requests")
    
    fields = [
        select_field("source", ["productboard", "custom", "jira", "other"], required=True, maxSelect=1),
        text_field("external_id", required=False, unique=False),
        text_field("external_url", required=False, unique=False),
        text_field("title", required=True, unique=False),
        text_field("description", required=False, unique=False),
        select_field("status", [
            "under_consideration",
            "planned", 
            "in_development",
            "released",
            "archived"
        ], required=False, maxSelect=1),
        text_field("release_version", required=False, unique=False),
        date_field("release_date", required=False),
        text_field("timeframe", required=False, unique=False),
        text_field("product", required=False, unique=False),
        select_field("priority", ["critical", "high", "medium", "low"], required=False, maxSelect=1),
        date_field("last_synced_at", required=False),
    ]
    
    coll = create_collection_if_missing("feature_requests", "base", fields)
    collections = get_all_collections()
    coll = collections["feature_requests"]
    for f in fields:
        ensure_field(coll, f)
    
    # Access rules
    fr_list_view_rule = '@request.auth.id != ""'
    fr_update_rule = '@request.auth.role = "manager" || @request.auth.role = "pm"'
    
    update_collection_rules(
        "feature_requests",
        listRule=AUTH_ONLY_RULE,
        viewRule=AUTH_ONLY_RULE,
        createRule=SE_ONLY_RULE,
        updateRule=SE_ONLY_RULE,
        deleteRule=SE_ONLY_RULE,
    )



def setup_poc_feature_requests():
    """
    poc_feature_requests:
      - poc (relation -> pocs)
      - feature_request (relation -> feature_requests)
      - use_case (relation -> use_cases, optional)
      - needed_by (text)
      - customer_impact (select)
      - se_comment (text)
      - customer_comment (text) ← NEW
      - importance (text)
      - is_deal_breaker (bool)
      - productboard_insight_id (text) ← NEW
      - created_by (relation -> users)
      - created_at (date)
    """
    print("[SETUP] poc_feature_requests")
    
    collections = get_all_collections()
    pocs = collections.get("pocs")
    feature_requests = collections.get("feature_requests")
    use_cases = collections.get("use_cases")
    users = collections.get("users")
    
    if not pocs or not feature_requests or not use_cases or not users:
        raise RuntimeError("Required collections missing for poc_feature_requests.")
    
    fields = [
        relation_field("poc", pocs["id"], maxSelect=1),
        relation_field("feature_request", feature_requests["id"], maxSelect=1),
        relation_field("use_case", use_cases["id"], maxSelect=1),
        text_field("needed_by", required=False),
        select_field("customer_impact", ["blocker", "high", "medium", "low"], required=False, maxSelect=1),
        text_field("se_comment", required=False, unique=False),
        text_field("customer_comment", required=False, unique=False),
        text_field("importance", required=False),
        bool_field("is_deal_breaker", required=False),
        text_field("productboard_insight_id", required=False, unique=False),
        relation_field("created_by", users["id"], maxSelect=1),
        date_field("created_at", required=False),
    ]
    
    coll = create_collection_if_missing("poc_feature_requests", "base", fields)
    collections = get_all_collections()
    coll = collections["poc_feature_requests"]
    for f in fields:
        ensure_field(coll, f)
    
    # Access rules
    # - any logged-in user can see poc_feature_requests
    # - only SEs can create/update/delete
    pfr_list_view_rule = '@request.auth.id != ""'
    pfr_create_rule = '@request.auth.role = "se"'
    pfr_update_delete_rule = '@request.auth.role = "se"'

    # Access rules – global policy:
    # - any logged-in user can see poc_feature_requests
    # - only SEs can create/update/delete
    update_collection_rules(
        "poc_feature_requests",
        listRule=AUTH_ONLY_RULE,
        viewRule=AUTH_ONLY_RULE,
        createRule=SE_ONLY_RULE,
        updateRule=SE_ONLY_RULE,
        deleteRule=SE_ONLY_RULE,
    )



# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

# Add to main():
def main():
    admin_login()
    setup_users_fields()
    setup_use_cases()
    setup_pocs()
    setup_ae_se_map()
    setup_poc_use_cases()
    setup_comments()
    setup_manager_se_map()
    setup_feature_requests()        # ← Add this
    setup_poc_feature_requests()    # ← Add this
    print("\n[DONE] PocketBase-Schema ist eingerichtet / aktualisiert.")

if __name__ == "__main__":
    main()
