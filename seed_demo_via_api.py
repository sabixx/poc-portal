#!/usr/bin/env python3
"""
Improved demo data seeder for POC Portal

Uses the NEW public API backend:

- POST /api/register       - Create/lookup POC by se.email + prospect + product
- POST /api/heartbeat      - Daily status with active/completed use cases
- POST /api/complete_use_case - Toggle completion status
- POST /api/rating         - Set star rating for a use case
- POST /api/feedback       - Submit text feedback for a use case

Creates for each SE multiple POCs with different date / use-case patterns:

  - POC where poc_end_date is in the past and some use cases are NOT completed
  - POC where all use cases are completed and poc_end_date is in the future
  - POC where all use cases are completed and poc_end_date is in the past
  - POC where the preparation start date is in the future
  - POCs with very large preparation estimates (>= 200h)
  - POCs with very large overall execution estimates (>= 800h)
  - POCs without any customer prep use cases

This script creates realistic demo data by:
  1. Registering POCs via /api/register
  2. Sending heartbeats with active/completed use cases via /api/heartbeat
  3. Adding ratings via /api/rating
  4. Adding feedback via /api/feedback
"""

import os
import random
import datetime as dt
from typing import List, Dict, Any, Set

import requests

API_BASE = os.environ.get("PB_API_URL", "http://127.0.0.1:8000")
API_KEY = os.environ.get("API_SHARED_SECRET")  # X-Api-Key

SESSION = requests.Session()
if API_KEY:
    SESSION.headers["X-Api-Key"] = API_KEY

# ---------------------------------------------------------------------------
# Use case catalogue
# ---------------------------------------------------------------------------

VISIBLE_USE_CASES = [
    "machine-identity/welcome",
    "machine-identity/setup-and-overview",
    "machine-identity/prepare-about-vsat",
    "machine-identity/prepare-vsat-firewall",
    "machine-identity/prepare-vsat-system",
    "machine-identity/prepare-customer-network-requirements",
    "machine-identity/prepare-customer-security-policy-review",
    "machine-identity/prepare-customer-application-inventory",
    "machine-identity/single-sign-on",
    "machine-identity/dashboard",
    "machine-identity/internet-discovery",
    "machine-identity/internal-discovery",
    "machine-identity/dashboard2",
    "machine-identity/certificate-location",
    "machine-identity/expiration-notification",
    "machine-identity/reporting-and-notification-policies",
    "machine-identity/certificate-validation",
    "machine-identity/import-certificates-from-microsoft-ca",
    "machine-identity/import-certificates-from-third-party-ca",
    "machine-identity/request-a-new-certificate-self-service",
    "machine-identity/request-a-new-certificate-with-approval-required",
    "machine-identity/auto-renewal",
    "machine-identity/windows-iis-automated-installation",
    "machine-identity/apache-automated-installation",
    "machine-identity/tomcat-automated-installation",
    "machine-identity/netscaler-automated-installation",
    "machine-identity/f5-big-ip-automated-installation",
    "machine-identity/kubernetes-cert-manager-integration",
    "machine-identity/azure-key-vault-integration",
    "machine-identity/aws-certificate-manager-integration",
    "machine-identity/full-automation-via-cli-api-vcert",
    "machine-identity/default-logging",
    "machine-identity/webhooks-splunk",
    "machine-identity/servicenow-integration",
    "machine-identity/pagerduty-integration",
    "machine-identity/reporting",
    "machine-identity/custom-report-builder",
    "machine-identity/compliance-dashboard",
    "machine-identity/documentation",
    "machine-identity/api-reference-documentation",
    "machine-identity/saas-overall-system-status",
    "machine-identity/technical-support",
    "machine-identity/eco-system-marketplace",
    "machine-identity/user-group-community-training",
    "machine-identity/role-based-access-control",
    "machine-identity/certificate-policy-enforcement",
    "machine-identity/multi-domain-support",
    "machine-identity/wildcard-certificate-management",
    "machine-identity/private-ca-integration",
    "machine-identity/certificate-revocation-management",
    "machine-identity/appendix",
    "machine-identity/feedback",
]

# Codes that are customer prep use cases
CUSTOMER_PREP_CODES = {
    "machine-identity/prepare-about-vsat",
    "machine-identity/prepare-vsat-firewall",
    "machine-identity/prepare-vsat-system",
    "machine-identity/prepare-customer-network-requirements",
    "machine-identity/prepare-customer-security-policy-review",
    "machine-identity/prepare-customer-application-inventory",
}


# ---------------------------------------------------------------------------
# Demo SE list (use these emails as 'sa_name' users in PocketBase)
# ---------------------------------------------------------------------------

SES = [
    "leo.schmidt@cyberark.com",
    "andrea.meyer@cyberark.com",
    "lisa.mueller@cyberark.com",
    "thomas.becker@cyberark.com",
    "nina.schneider@cyberark.com",
    "felix.wagner@cyberark.com",
    "sarah.weber@cyberark.com",
    "sven.fischer@cyberark.com",
    "daniel.hoffmann@cyberark.com",
    "maria.rodriguez@cyberark.com",
    "thomas.becker@cyberark.com",
]

CUSTOMERS = [
    ("Sample Company A", "Banking"),
    ("Sample Company B", "Logistics"),
    ("Sample Company C", "Manufacturing"),
    ("Sample Company D", "Insurance"),
    ("Sample Company E", "Retail"),
]

PARTNERS = [
    "",
    "Accenture",
    "Deloitte",
    "T-Systems",
    "PwC",
    "KPMG",
    "Computacenter",
]

SAAS_PRODUCTS = [
    "Certificate Manager SaaS",
    "Secrets Manager SaaS",
    "Privileged Access Manager SaaS",
]

SCENARIOS = [
    "overdue_incomplete",   # end date in past, some UCs still open
    "green_future",         # all UCs completed, end in future
    "green_past",           # all UCs completed, end in past
    "prep_future",          # preparation start date in future
    "long_prep",            # very large customer prep estimates (~200h)
    "long_exec",            # very large internal execution estimates (~800h)
    "no_prep",              # no customer prep use cases at all
    "stale_incomplete",     # uncompleted use cases, last update >2 days ago
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def post(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{API_BASE}{path}"
    resp = SESSION.post(url, json=payload, timeout=60)
    if resp.status_code >= 400:
        print(f"[SEED] ERROR {path}: {resp.status_code} {resp.text.strip()}")
        raise SystemExit(1)
    return resp.json()


def build_poc_dates(scenario: str, today: dt.date) -> Dict[str, dt.date]:
    """
    Create poc_start_date, poc_end_date depending on scenario.
    """
    # base: some reasonable history
    poc_start = today - dt.timedelta(days=random.randint(5, 20))
    poc_end = poc_start + dt.timedelta(days=random.randint(7, 20))

    if scenario == "overdue_incomplete":
        poc_end = today - dt.timedelta(days=random.randint(1, 10))
    elif scenario == "green_future":
        poc_end = today + dt.timedelta(days=random.randint(3, 30))
    elif scenario == "green_past":
        poc_end = today - dt.timedelta(days=random.randint(1, 15))
    elif scenario == "prep_future":
        poc_start = today + dt.timedelta(days=random.randint(1, 14))
        poc_end = poc_start + dt.timedelta(days=random.randint(7, 20))
    elif scenario in ("long_prep", "long_exec", "no_prep"):
        pass

    # stale / weird variants
    if random.random() < 0.25:
        poc_start = today - dt.timedelta(days=random.randint(30, 180))
        poc_end = poc_start + dt.timedelta(days=random.randint(7, 30))

    return {
        "poc_start": poc_start,
        "poc_end": poc_end,
    }


def build_use_cases_for_scenario(scenario: str) -> Dict[str, Any]:
    """
    Build lists of active and completed use cases for a single POC.
    Returns dict with 'active' and 'completed' lists of use case codes.
    """
    num_uc = random.randint(10, 22)
    selected_codes = random.sample(VISIBLE_USE_CASES, k=num_uc)

    active_use_cases: List[str] = []
    completed_use_cases: List[str] = []

    for code in selected_codes:
        is_prep = code in CUSTOMER_PREP_CODES
        
        # For no_prep scenario, skip all customer prep use cases
        if scenario == "no_prep" and is_prep:
            continue

        active_use_cases.append(code)

        # Determine completion status based on scenario
        if scenario == "green_future":
            is_completed = True
        elif scenario == "green_past":
            is_completed = True
        elif scenario == "overdue_incomplete":
            is_completed = random.random() < 0.4
        elif scenario == "stale_incomplete":
            is_completed = random.random() < 0.5
        elif scenario == "prep_future":
            is_completed = False
        elif scenario == "no_prep":
            is_completed = random.random() < 0.6
        else:
            is_completed = random.random() < 0.5

        if is_completed:
            completed_use_cases.append(code)

    # Ensure overdue_incomplete has at least one incomplete
    if scenario == "overdue_incomplete":
        if len(completed_use_cases) == len(active_use_cases) and active_use_cases:
            # Remove one from completed
            completed_use_cases.pop()

    # Ensure stale_incomplete has at least 30% incomplete
    if scenario == "stale_incomplete":
        while len(completed_use_cases) > len(active_use_cases) * 0.7 and completed_use_cases:
            completed_use_cases.pop()

    # Ensure we have enough use cases for no_prep scenario
    if scenario == "no_prep" and len(active_use_cases) < 8:
        non_prep_codes = [c for c in VISIBLE_USE_CASES if c not in CUSTOMER_PREP_CODES]
        additional = random.sample(
            [c for c in non_prep_codes if c not in active_use_cases],
            k=min(8 - len(active_use_cases), len(non_prep_codes) - len(active_use_cases))
        )
        for code in additional:
            active_use_cases.append(code)
            if random.random() < 0.6:
                completed_use_cases.append(code)

    return {
        "active": active_use_cases,
        "completed": completed_use_cases,
    }


# ---------------------------------------------------------------------------
# Feedback text helpers
# ---------------------------------------------------------------------------

FEEDBACK_TEXTS = [
    "The customer's security team was extremely impressed with the automation capabilities demonstrated during the session. Their lead architect mentioned that this addresses a critical pain point they've been struggling with for over two years, where manual certificate renewals have led to multiple production outages. They specifically highlighted the automated renewal workflow and the early expiration warnings as game-changers for their operations. The CISO joined the last 15 minutes and expressed strong interest in moving forward to a production pilot.",
    
    "During today's demonstration, the operations team provided very positive feedback about the dashboard's visibility and reporting capabilities. They mentioned that having a centralized view of all certificates across their multi-cloud environment would significantly reduce the time they spend tracking certificate inventory manually. The team lead shared that they currently use spreadsheets and have no automated way to track certificates in their AWS, Azure, and on-premises environments. They're particularly excited about the compliance reporting features for their upcoming SOC 2 audit.",
    
    "Customer explicitly stated that the automation capabilities shown are a strong differentiator compared to their current manual process and the other solutions they've evaluated. Their infrastructure team noted that the solution's ability to integrate with their existing CI/CD pipelines and automatically deploy certificates to load balancers would save them approximately 40 hours per month in operational overhead. They're keen to expand the scope to include their Kubernetes clusters in the next phase.",
    
    "The platform team was very enthusiastic about the role-based access control model and how it aligns with their existing governance framework. They appreciated that the solution respects their organizational structure and allows them to delegate certificate management responsibilities without compromising security. The IT security manager mentioned this would help them enforce their new certificate policy which mandates 90-day validity periods and specific cryptographic standards across all business units.",
    
    "Security team confirmed that the POC has already delivered tangible value by helping them discover 47 previously unknown certificates in their production environment, including several that had already expired. This discovery alone justified the POC effort according to their security director. They were particularly impressed with the agentless discovery capabilities and the fact that it didn't require any changes to their existing infrastructure. They want to keep the POC environment running and expand discovery to additional network segments.",
    
    "Operations team reported that the integration with their F5 load balancers went much smoother than anticipated, especially compared to their previous experiences with other certificate management tools. The senior network engineer mentioned that the automated deployment and verification reduced what typically takes 2-3 hours down to just a few minutes. They're now asking if we can include their NetScaler and Azure Application Gateway instances in the automated workflow as well.",
    
    "The CISO attended today's session and specifically called out the compliance reporting and audit trail capabilities as extremely valuable for their upcoming PCI-DSS audit. He mentioned that their auditors have previously cited certificate management as a concern, and having this level of visibility and automation would address multiple audit findings. He asked his team to fast-track the business case for moving this into production before Q2.",
    
    "Customer stated that the overall solution architecture fits extremely well into their cloud-first strategy and their goal to reduce manual operational tasks. The cloud architecture team lead was impressed by the API-first design and mentioned they plan to integrate it with their existing automation platform and ServiceNow workflows. They're interested in exploring additional use cases beyond the initial scope, including IoT device certificate management and code-signing certificate lifecycle management.",
    
    "Platform engineering team was very positive about the self-service certificate request portal and the approval workflow capabilities. They mentioned this would empower their development teams to manage their own certificates while still maintaining proper security controls and compliance. The DevOps manager shared that they currently have a ticketing backlog of 30+ certificate requests and this solution would eliminate that bottleneck entirely. They want to pilot this with three development teams next month.",
    
    "Customer confirmed they want to use this POC environment as a reference architecture for their upcoming rollout to additional regions. They were particularly impressed with how the multi-tenant capabilities would allow them to segment certificate management by business unit while maintaining centralized visibility. The enterprise architect asked if we could schedule a knowledge transfer session with their infrastructure team to help them prepare for the production deployment in EMEA and APAC regions.",
    
    "The infrastructure security team provided excellent feedback on the certificate policy enforcement capabilities. They mentioned that being able to define and automatically enforce certificate standards organization-wide would significantly reduce their current security risks. Their senior security analyst pointed out three production incidents in the past year caused by non-compliant certificates, and this solution would have prevented all of them. They're working with procurement to accelerate the approval process.",
    
    "During the session, the customer's automation team expressed strong interest in the API and CLI capabilities, stating these would integrate seamlessly with their existing Terraform and Ansible automation. The DevOps lead demonstrated how they could potentially incorporate certificate lifecycle management into their infrastructure-as-code approach. They mentioned this would be a significant improvement over their current manual process which requires opening tickets and waiting for the security team to provision certificates.",
]

QUESTION_TEXTS = [
    "Customer asked whether the solution can integrate with their existing Splunk SIEM for centralized logging and alerting. Their security operations team wants to correlate certificate events with other security events in their SOC.",
    
    "The team raised questions about multi-tenant support and data isolation, specifically asking how certificate data for different business units or subsidiaries would be segregated.",
    
    "Customer wants to understand the audit logging capabilities in much more detail, including how long audit logs are retained and whether they can be exported for long-term archival.",
    
    "Question came up about whether certain features or use cases can be scoped to specific organizational units or departments.",
    
    "Customer asked detailed questions about disaster recovery and failover scenarios, including what happens if the certificate management service becomes unavailable.",
    
    "The operations team inquired about integration capabilities with their ServiceNow CMDB and whether certificate information can be automatically synchronized.",
    
    "Questions were raised about the certificate discovery process and whether it requires agents to be installed on all systems or if it can work in an agentless mode.",
    
    "Customer asked about private CA integration and whether the solution can work with their internal Active Directory Certificate Services infrastructure.",
    
    "The platform team wants to know if the solution supports automated certificate deployment to cloud-native services like AWS ELB, Azure Application Gateway, and Google Cloud Load Balancer.",
    
    "Questions came up regarding the handling of wildcard certificates versus individual certificates, including best practices for migration.",
]


# ---------------------------------------------------------------------------
# Main seeding
# ---------------------------------------------------------------------------

def seed_demo_data():
    today = dt.date.today()
    all_pocs: List[Dict[str, Any]] = []

    for se_email in SES:
        for scenario in SCENARIOS:
            for _ in range(1):  # 1 POC per scenario per SE
                customer_name, industry = random.choice(CUSTOMERS)
                partner = random.choice(PARTNERS)
                product = random.choice(SAAS_PRODUCTS)

                dates = build_poc_dates(scenario, today)
                poc_start = dates["poc_start"]
                poc_end = dates["poc_end"]

                use_cases = build_use_cases_for_scenario(scenario)

                # --------------------------------------------------------
                # Step 1: Register the POC
                # --------------------------------------------------------
                # se_email is the SA's email address
                sa_email = se_email
                sa_display_name = sa_email.split("@")[0].replace(".", " ").title()
                
                register_payload = {
                    "sa_name": sa_display_name,
                    "sa_email": sa_email,
                    "prospect": customer_name,
                    "product": product,
                    "partner": partner if partner else None,
                    "poc_start_date": poc_start.isoformat(),
                    "poc_end_date": poc_end.isoformat(),
                }

                print(f"[SEED] /api/register for {sa_email} / {customer_name} / {product} ({scenario})")
                register_result = post("/api/register", register_payload)
                poc_uid = register_result.get("poc_uid")

                if not poc_uid:
                    print(f"[SEED] ERROR: No poc_uid returned from register")
                    continue

                print(f"[SEED]   -> poc_uid: {poc_uid} (is_new: {register_result.get('is_new')})")

                # --------------------------------------------------------
                # Step 2: Send heartbeat with use cases
                # --------------------------------------------------------
                # Convert to new API format
                completed_set = set(use_cases["completed"])
                use_cases_payload = [
                    {
                        "code": code,
                        "is_active": True,
                        "is_completed": code in completed_set,
                        "order": idx + 1,
                    }
                    for idx, code in enumerate(use_cases["active"])
                ]

                heartbeat_payload = {
                    "poc_uid": poc_uid,
                    "use_cases": use_cases_payload,
                }

                print(f"[SEED] /api/heartbeat {poc_uid}: {len(use_cases['active'])} active, {len(use_cases['completed'])} completed")
                post("/api/heartbeat", heartbeat_payload)

                all_pocs.append({
                    "poc_uid": poc_uid,
                    "sa_email": sa_email,
                    "sa_name": sa_display_name,
                    "customer_name": customer_name,
                    "product": product,
                    "scenario": scenario,
                    "active_use_cases": use_cases["active"],
                    "completed_use_cases": use_cases["completed"],
                })

    # ------------------------------------------------------------------
    # Step 3: Add ratings for a subset of COMPLETED use cases
    # ------------------------------------------------------------------
    print("\n[SEED] Adding ratings...")
    
    for poc in all_pocs:
        poc_uid = poc["poc_uid"]
        completed_ucs = poc["completed_use_cases"]
        
        if not completed_ucs:
            continue

        # Rate 70-90% of completed use cases
        num_to_rate = max(1, int(len(completed_ucs) * random.uniform(0.7, 0.9)))
        for use_case_code in random.sample(completed_ucs, k=num_to_rate):
            # More varied rating distribution: mostly 4-5, some 3s, rare 2s
            rating = random.choices([2, 3, 4, 5], weights=[5, 15, 40, 40])[0]

            print(f"[SEED] /api/rating {poc_uid} / {use_case_code} -> {rating} stars")
            post("/api/rating", {
                "poc_uid": poc_uid,
                "use_case_code": use_case_code,
                "rating": rating,
            })

    # ------------------------------------------------------------------
    # Step 4: Add feedback on various "interesting" use cases
    # ------------------------------------------------------------------
    print("\n[SEED] Adding feedback...")
    
    interesting_codes = [
        "machine-identity/single-sign-on",
        "machine-identity/certificate-validation",
        "machine-identity/internet-discovery",
        "machine-identity/internal-discovery",
        "machine-identity/auto-renewal",
        "machine-identity/dashboard",
        "machine-identity/kubernetes-cert-manager-integration",
        "machine-identity/azure-key-vault-integration",
        "machine-identity/servicenow-integration",
        "machine-identity/role-based-access-control",
        "machine-identity/certificate-policy-enforcement",
    ]

    for poc in all_pocs:
        poc_uid = poc["poc_uid"]
        active_ucs = poc["active_use_cases"]

        codes_here = [code for code in active_ucs if code in interesting_codes]
        if not codes_here:
            continue

        # Add feedback to 1-2 interesting use cases per POC
        for use_case_code in random.sample(codes_here, k=min(2, len(codes_here))):
            feedback_text = random.choice(FEEDBACK_TEXTS)

            print(f"[SEED] /api/feedback {poc_uid} / {use_case_code}")
            post("/api/feedback", {
                "poc_uid": poc_uid,
                "use_case_code": use_case_code,
                "text": feedback_text,
            })

            # Also add a question as feedback (since we only have feedback endpoint)
            if random.random() < 0.5:
                question_text = random.choice(QUESTION_TEXTS)
                print(f"[SEED] /api/feedback (question) {poc_uid} / {use_case_code}")
                post("/api/feedback", {
                    "poc_uid": poc_uid,
                    "use_case_code": use_case_code,
                    "text": f"Question from customer: {question_text}",
                })

    print("\n[SEED] Done – demo data created.")
    print(f"[SEED] Created {len(all_pocs)} POCs across {len(SES)} SEs")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print(f"[SEED] Using API_BASE={API_BASE}")
    if API_KEY:
        print("[SEED] Using X-Api-Key authentication")
    else:
        print(
            "[SEED] WARNING: no API_SHARED_SECRET set – "
            "backend must allow unauthenticated calls."
        )
    print()
    seed_demo_data()