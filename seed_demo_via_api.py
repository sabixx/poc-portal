#!/usr/bin/env python3
"""
Improved demo data seeder for POC Portal

Uses the public API backend:

- POST /api/daily_update
- POST /api/rate_use_case
- POST /api/comment

Creates for each SE multiple POCs with different date / use-case patterns:

  - POC where poc_end_date_plan is in the past and some use cases are NOT completed
  - POC where all use cases are completed and poc_end_date_plan is in the future
  - POC where all use cases are completed and poc_end_date_plan is in the past
  - POC where the preparation start date is in the future
  - POCs with very large preparation estimates (>= 200h)
  - POCs with very large overall execution estimates (>= 800h)
  - POCs without any customer prep use cases

The frontend will later calculate "at risk" status based on:
  - prep_start_date / poc_start_date vs. estimate_hours
  - poc_start_date / poc_end_date_plan vs. estimate_hours

This script just makes sure the data contains those "heavy" use cases,
and also adds ratings + feedback for a subset of completed use cases
via /api/rate_use_case.
"""

import os
import random
import datetime as dt
from typing import List, Dict, Any

import requests

API_BASE = os.environ.get("API_BASE", "http://127.0.0.1:8000")
API_KEY = os.environ.get("API_SHARED_SECRET")  # X-Api-Key

SESSION = requests.Session()
if API_KEY:
    SESSION.headers["X-Api-Key"] = API_KEY

# ---------------------------------------------------------------------------
# Use case catalogue
# ---------------------------------------------------------------------------

VISIBLE_USE_CASES = [
    "welcome",
    "Setup-and-Overview",
    "prepare-about-vsat",
    "prepare-vsat-firewall",
    "prepare-vsat-system",
    "prepare-customer-network-requirements",
    "prepare-customer-security-policy-review",
    "prepare-customer-application-inventory",
    "Single-Sign-On",
    "Dashboard",
    "Internet-Discovery",
    "Internal-Discovery",
    "Dashboard2",
    "Certificate-Location",
    "Expiration-Notification",
    "Reporting-and-Notification-Policies",
    "Certificate-Validation",
    "Import-certificates-from-Microsoft-CA",
    "Import-certificates-from-Third-Party-CA",
    "Request-a-New-Certificate-Self-Service",
    "Request-a-New-Certificate-with-Approval-Required",
    "Auto-Renewal",
    "Windows-IIS-Automated-Installation",
    "Apache-Automated-Installation",
    "Tomcat-Automated-Installation",
    "NetScaler-Automated-Installation",
    "F5-BIG-IP-Automated-Installation",
    "Kubernetes-Cert-Manager-Integration",
    "Azure-Key-Vault-Integration",
    "AWS-Certificate-Manager-Integration",
    "Full-automation-via-CLI-API-VCert",
    "Default-Logging",
    "Webhooks-Splunk",
    "ServiceNow-Integration",
    "PagerDuty-Integration",
    "Reporting",
    "Custom-Report-Builder",
    "Compliance-Dashboard",
    "Documentation",
    "API-reference-documentation",
    "SaaS-Overall-System-Status",
    "Technical-Support",
    "Eco-System-Marketplace",
    "User-Group-Community-Training",
    "Role-Based-Access-Control",
    "Certificate-Policy-Enforcement",
    "Multi-Domain-Support",
    "Wildcard-Certificate-Management",
    "Private-CA-Integration",
    "Certificate-Revocation-Management",
    "Appendix",
]

USE_CASE_META: Dict[str, Dict[str, str]] = {
    code: {
        "title": code.replace("-", " ").replace("_", " ").title(),
        "product_family": "MIM",
        "product": "Certificate Manager SaaS",
        "description": f"Use case '{code}' in the CyberArk Certificate Manager POC.",
        "category": "General",  # default; overridden below
    }
    for code in VISIBLE_USE_CASES
}

# nicer titles for a few
USE_CASE_META["Dashboard"]["title"] = "Operations Dashboard"
USE_CASE_META["Auto-Renewal"]["title"] = "Auto Renewal"
USE_CASE_META["Single-Sign-On"]["title"] = "Single Sign-On Integration"
USE_CASE_META["Internet-Discovery"]["title"] = "Internet Discovery"
USE_CASE_META["Internal-Discovery"]["title"] = "Internal Discovery"
USE_CASE_META["F5-BIG-IP-Automated-Installation"]["title"] = "F5 BIG-IP Automated Installation"
USE_CASE_META["Kubernetes-Cert-Manager-Integration"]["title"] = "Kubernetes Cert-Manager Integration"
USE_CASE_META["Azure-Key-Vault-Integration"]["title"] = "Azure Key Vault Integration"
USE_CASE_META["AWS-Certificate-Manager-Integration"]["title"] = "AWS Certificate Manager Integration"
USE_CASE_META["ServiceNow-Integration"]["title"] = "ServiceNow Integration"
USE_CASE_META["PagerDuty-Integration"]["title"] = "PagerDuty Integration"
USE_CASE_META["Custom-Report-Builder"]["title"] = "Custom Report Builder"
USE_CASE_META["Compliance-Dashboard"]["title"] = "Compliance Dashboard"
USE_CASE_META["Role-Based-Access-Control"]["title"] = "Role-Based Access Control (RBAC)"
USE_CASE_META["Certificate-Policy-Enforcement"]["title"] = "Certificate Policy Enforcement"
USE_CASE_META["Multi-Domain-Support"]["title"] = "Multi-Domain Support"
USE_CASE_META["Wildcard-Certificate-Management"]["title"] = "Wildcard Certificate Management"
USE_CASE_META["Private-CA-Integration"]["title"] = "Private CA Integration"
USE_CASE_META["Certificate-Revocation-Management"]["title"] = "Certificate Revocation Management"

# meaningful categories per use case
CATEGORY_OVERRIDES = {
    # Onboarding & setup
    "welcome": "Onboarding & Success Planning",
    "Setup-and-Overview": "Onboarding & Success Planning",
    "prepare-about-vsat": "Onboarding & Success Planning",
    "prepare-vsat-firewall": "Onboarding & Success Planning",
    "prepare-vsat-system": "Onboarding & Success Planning",
    "prepare-customer-network-requirements": "Onboarding & Success Planning",
    "prepare-customer-security-policy-review": "Onboarding & Success Planning",
    "prepare-customer-application-inventory": "Onboarding & Success Planning",
    "Single-Sign-On": "Onboarding & Success Planning",

    # Discovery & inventory
    "Internet-Discovery": "Discovery & Inventory",
    "Internal-Discovery": "Discovery & Inventory",
    "Certificate-Location": "Discovery & Inventory",
    "Import-certificates-from-Microsoft-CA": "Discovery & Inventory",
    "Import-certificates-from-Third-Party-CA": "Discovery & Inventory",

    # Automation & installation
    "Auto-Renewal": "Automation & Installation",
    "Windows-IIS-Automated-Installation": "Automation & Installation",
    "Apache-Automated-Installation": "Automation & Installation",
    "Tomcat-Automated-Installation": "Automation & Installation",
    "NetScaler-Automated-Installation": "Automation & Installation",
    "F5-BIG-IP-Automated-Installation": "Automation & Installation",
    "Kubernetes-Cert-Manager-Integration": "Automation & Installation",
    "Azure-Key-Vault-Integration": "Automation & Installation",
    "AWS-Certificate-Manager-Integration": "Automation & Installation",
    "Full-automation-via-CLI-API-VCert": "Automation & Installation",
    "Request-a-New-Certificate-Self-Service": "Automation & Installation",
    "Request-a-New-Certificate-with-Approval-Required": "Automation & Installation",

    # Observability & governance
    "Dashboard": "Observability & Governance",
    "Dashboard2": "Observability & Governance",
    "Expiration-Notification": "Observability & Governance",
    "Reporting-and-Notification-Policies": "Observability & Governance",
    "Reporting": "Observability & Governance",
    "Certificate-Validation": "Observability & Governance",
    "SaaS-Overall-System-Status": "Observability & Governance",
    "Compliance-Dashboard": "Observability & Governance",
    "Role-Based-Access-Control": "Observability & Governance",
    "Certificate-Policy-Enforcement": "Observability & Governance",
    "Multi-Domain-Support": "Observability & Governance",
    "Wildcard-Certificate-Management": "Observability & Governance",
    "Private-CA-Integration": "Observability & Governance",
    "Certificate-Revocation-Management": "Observability & Governance",

    # Integrations & ecosystem
    "Default-Logging": "Integrations & Ecosystem",
    "Webhooks-Splunk": "Integrations & Ecosystem",
    "ServiceNow-Integration": "Integrations & Ecosystem",
    "PagerDuty-Integration": "Integrations & Ecosystem",
    "API-reference-documentation": "Integrations & Ecosystem",
    "Eco-System-Marketplace": "Integrations & Ecosystem",

    # Enablement & support
    "Documentation": "Enablement & Support",
    "Technical-Support": "Enablement & Support",
    "User-Group-Community-Training": "Enablement & Support",
    "Custom-Report-Builder": "Enablement & Support",
    "Appendix": "Enablement & Support",
}

for code, category in CATEGORY_OVERRIDES.items():
    if code in USE_CASE_META:
        USE_CASE_META[code]["category"] = category


# ---------------------------------------------------------------------------
# Demo SE list (use these emails as 'se' users in PocketBase)
# ---------------------------------------------------------------------------

SES = [
    "leo.schmidt@cyberark.com",
    "andrea.meyer@cyberark.com",
    "lisa.mueller@cyberark.com",
    "thomas.becker@cyberark.com",
    "maria.rodriguez@cyberark.com",
    "daniel.hoffmann@cyberark.com",
    "sven.fischer@cyberark.com",
    "sarah.weber@cyberark.com",
    "felix.wagner@cyberark.com",
    "nina.schneider@cyberark.com",
    "robert.huber@cyberark.com",
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
    "Partner: Accenture",
    "Partner: Deloitte",
    "Partner: T-Systems",
    "Partner: PwC",
    "Partner: KPMG",
    "Partner: Computacenter",
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


def build_use_case_block(
    code: str,
    is_active: bool,
    is_completed: bool,
    is_prep: bool,
    estimate_hours: float,
) -> Dict[str, Any]:
    meta = USE_CASE_META.get(code, {})
    return {
        "code": code,
        "title": meta.get("title", code),
        "description": meta.get("description", ""),
        "version": 1,
        "product_family": meta.get("product_family", "MIM"),
        "product": meta.get("product", "Certificate Manager SaaS"),
        "category": meta.get("category", "General"),
        "is_active": is_active,
        "is_completed": is_completed,
        "is_customer_prep": is_prep,
        "estimate_hours": float(estimate_hours),
    }


def build_poc_dates(scenario: str, today: dt.date) -> Dict[str, dt.date]:
    """
    Create prep_start_date, poc_start_date, poc_end_date_plan
    depending on scenario.
    """
    # base: some reasonable history
    prep_start = today - dt.timedelta(days=random.randint(5, 20))
    poc_start = prep_start + dt.timedelta(days=random.randint(1, 3))
    poc_end = poc_start + dt.timedelta(days=random.randint(7, 20))

    if scenario == "overdue_incomplete":
        poc_end = today - dt.timedelta(days=random.randint(1, 10))
    elif scenario == "green_future":
        poc_end = today + dt.timedelta(days=random.randint(3, 30))
    elif scenario == "green_past":
        poc_end = today - dt.timedelta(days=random.randint(1, 15))
    elif scenario == "prep_future":
        prep_start = today + dt.timedelta(days=random.randint(1, 14))
        poc_start = prep_start + dt.timedelta(days=random.randint(2, 7))
        poc_end = poc_start + dt.timedelta(days=random.randint(7, 20))
    elif scenario in ("long_prep", "long_exec", "no_prep"):
        pass

    # stale / weird variants
    if random.random() < 0.25:
        poc_start = today - dt.timedelta(days=random.randint(30, 180))
        poc_end = poc_start + dt.timedelta(days=random.randint(7, 30))
        prep_start = poc_start - dt.timedelta(days=random.randint(3, 14))

    if random.random() < 0.15:
        prep_start = poc_start + dt.timedelta(days=random.randint(1, 10))

    return {
        "prep_start": prep_start,
        "poc_start": poc_start,
        "poc_end_plan": poc_end,
    }


def build_use_cases_for_scenario(scenario: str) -> List[Dict[str, Any]]:
    """
    Build a list of use case entries for a single POC.
    We only encode statuses + estimates here; risk logic is handled in frontend.
    """
    num_uc = random.randint(10, 22)
    selected_codes = random.sample(VISIBLE_USE_CASES, k=num_uc)

    ucs: List[Dict[str, Any]] = []

    for code in selected_codes:
        # Determine if this is customer prep based on prefix
        is_prep = code.startswith("prepare-")
        
        # For no_prep scenario, skip all customer prep use cases
        if scenario == "no_prep" and is_prep:
            continue

        if scenario == "green_future":
            status_completed = True
            estimate = random.choice([2, 4, 6, 8])
        elif scenario == "green_past":
            status_completed = True
            estimate = random.choice([2, 4, 6, 8])
        elif scenario == "overdue_incomplete":
            status_completed = random.random() < 0.4
            estimate = random.choice([4, 6, 8, 12])
        elif scenario == "stale_incomplete":
            # 40-60% completed, rest still open
            status_completed = random.random() < 0.5
            estimate = random.choice([4, 6, 8, 12])
        elif scenario == "prep_future":
            status_completed = False
            estimate = random.choice([2, 4, 8, 12])
        elif scenario == "no_prep":
            status_completed = random.random() < 0.6
            estimate = random.choice([4, 8, 12])
        else:
            status_completed = random.random() < 0.5
            estimate = random.choice([4, 8, 12])

        if scenario == "long_prep" and is_prep:
            estimate = random.choice([200, 240, 320, 400])

        if scenario == "long_exec" and not is_prep:
            estimate = random.choice([800, 960, 1200])

        uc = build_use_case_block(
            code=code,
            is_active=True,
            is_completed=status_completed,
            is_prep=is_prep,
            estimate_hours=estimate,
        )
        ucs.append(uc)

    if scenario == "overdue_incomplete":
        if not any(not uc["is_completed"] for uc in ucs):
            random.choice(ucs)["is_completed"] = False

    if scenario == "stale_incomplete":
        # Ensure at least 30% are NOT completed
        completed_count = sum(1 for uc in ucs if uc["is_completed"])
        if completed_count > len(ucs) * 0.7:
            # Make some random ones incomplete
            num_to_uncomplete = int(len(ucs) * 0.4)
            for uc in random.sample(ucs, k=num_to_uncomplete):
                uc["is_completed"] = False

    # Ensure we have some use cases even for no_prep scenario
    if scenario == "no_prep" and len(ucs) < 8:
        non_prep_codes = [c for c in VISIBLE_USE_CASES if not c.startswith("prepare-")]
        additional = random.sample([c for c in non_prep_codes if c not in [uc["code"] for uc in ucs]], k=8-len(ucs))
        for code in additional:
            uc = build_use_case_block(
                code=code,
                is_active=True,
                is_completed=random.random() < 0.6,
                is_prep=False,
                estimate_hours=random.choice([4, 8, 12]),
            )
            ucs.append(uc)

    return ucs


# ---------------------------------------------------------------------------
# Comment text helpers
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
    "Customer asked whether the solution can integrate with their existing Splunk SIEM for centralized logging and alerting. Their security operations team wants to correlate certificate events with other security events in their SOC. They also inquired about the specific log formats and whether custom webhooks are supported for pushing events to their incident response platform.",
    
    "The team raised questions about multi-tenant support and data isolation, specifically asking how certificate data for different business units or subsidiaries would be segregated. Their compliance officer wants to ensure that each business unit can only access their own certificates and that there's a clear audit trail showing who accessed what data. They also asked about supporting different certificate policies per tenant.",
    
    "Customer wants to understand the audit logging capabilities in much more detail, including how long audit logs are retained, whether they can be exported for long-term archival, and if there are any regulatory compliance certifications (SOC 2, ISO 27001) for the audit logging system. Their legal team is particularly concerned about being able to demonstrate compliance with data retention requirements.",
    
    "Question came up about whether certain features or use cases can be scoped to specific organizational units or departments. They want to roll out the solution in phases, starting with their e-commerce platform team before expanding to other parts of the organization. They need to understand if they can enable different features for different groups and how granular the access controls can be.",
    
    "Customer asked detailed questions about disaster recovery and failover scenarios, including what happens if the certificate management service becomes unavailable. Their infrastructure team wants to understand the RTO and RPO guarantees, whether there are redundant systems in different regions, and what manual procedures would be needed during an outage. They're particularly concerned about certificate renewals that might be due during a service disruption.",
    
    "The operations team inquired about integration capabilities with their ServiceNow CMDB and whether certificate information can be automatically synchronized with their configuration management database. They want to track certificates as configuration items and link them to the applications and systems that use them. They also asked about notification workflows through ServiceNow when certificates are nearing expiration.",
    
    "Questions were raised about the certificate discovery process and whether it requires agents to be installed on all systems or if it can work in an agentless mode. Their security policy prohibits installing third-party agents on production systems without extensive security reviews. They want to understand all the network access requirements and firewall rules that would need to be configured.",
    
    "Customer asked about private CA integration and whether the solution can work with their internal Active Directory Certificate Services infrastructure in addition to public CAs. They have a hybrid model where some certificates are issued by internal CAs for internal applications and public CAs for external-facing services. They need both to be managed in a single platform.",
    
    "The platform team wants to know if the solution supports automated certificate deployment to cloud-native services like AWS ELB, Azure Application Gateway, and Google Cloud Load Balancer. They're particularly interested in whether certificate updates can trigger automated deployments without manual intervention and whether there's built-in verification to ensure the new certificates are working correctly before removing the old ones.",
    
    "Questions came up regarding the handling of wildcard certificates versus individual certificates, including best practices and whether the solution can help them migrate from their current widespread use of wildcard certificates to more granular certificate management. Their security team is pushing to eliminate wildcard certificates due to security concerns, but they're not sure how to manage the resulting increase in certificate volume.",
]


# ---------------------------------------------------------------------------
# Main seeding
# ---------------------------------------------------------------------------

def seed_demo_data():
    today = dt.date.today()
    poc_counter = 1
    all_pocs: List[Dict[str, Any]] = []

    for se_email in SES:
        for scenario in SCENARIOS:
            for _ in range(2):  # 2 POCs per scenario per SE
                customer_name, industry = random.choice(CUSTOMERS)
                partner = random.choice(PARTNERS)

                poc_uid = f"{customer_name.split()[0].upper()}-{poc_counter:03d}"
                poc_counter += 1

                dates = build_poc_dates(scenario, today)
                prep_start = dates["prep_start"]
                poc_start = dates["poc_start"]
                poc_end_plan = dates["poc_end_plan"]

                use_cases = build_use_cases_for_scenario(scenario)

                poc_end_actual = None
                if scenario in ("green_past", "overdue_incomplete") and random.random() < 0.5:
                    poc_end_actual = poc_end_plan + dt.timedelta(days=random.randint(0, 3))

                # For stale_incomplete, set snapshot_date to 3-14 days ago
                snapshot_date = today
                if scenario == "stale_incomplete":
                    snapshot_date = today - dt.timedelta(days=random.randint(3, 14))

                payload = {
                    "se_email": se_email,
                    "poc_uid": poc_uid,
                    "poc_name": f"{customer_name} – {industry} POC",
                    "customer_name": customer_name,
                    "partner": partner,
                    "prep_start_date": prep_start.isoformat(),
                    "poc_start_date": poc_start.isoformat(),
                    "poc_end_date_plan": poc_end_plan.isoformat(),
                    "poc_end_date_actual": poc_end_actual.isoformat() if poc_end_actual else None,
                    "snapshot_date": snapshot_date.isoformat(),
                    "use_cases": use_cases,
                }

                print(f"[SEED] /api/daily_update {poc_uid} ({scenario}) for {se_email}")
                post("/api/daily_update", payload)

                all_pocs.append(
                    {
                        "poc_uid": poc_uid,
                        "se_email": se_email,
                        "customer_name": customer_name,
                        "scenario": scenario,
                        "use_cases": use_cases,
                    }
                )

    # ------------------------------------------------------------------
    # 1) Add ratings for a subset of COMPLETED use cases via /api/rate_use_case
    # ------------------------------------------------------------------
    for poc in all_pocs:
        se_email = poc["se_email"]
        customer_name = poc["customer_name"]
        poc_uid = poc["poc_uid"]

        completed_ucs = [uc for uc in poc["use_cases"] if uc.get("is_completed")]
        if not completed_ucs:
            continue

        # Rate 70-90% of completed use cases (much more ratings!)
        num_to_rate = max(1, int(len(completed_ucs) * random.uniform(0.7, 0.9)))
        for uc in random.sample(completed_ucs, k=num_to_rate):
            code = uc["code"]
            # More varied rating distribution: mostly 4-5, some 3s, rare 2s
            rating = random.choices([2, 3, 4, 5], weights=[5, 15, 40, 40])[0]
            text = random.choice(FEEDBACK_TEXTS)

            print(f"[SEED] /api/rate_use_case (rating {rating}) {code} for {poc_uid}")
            post(
                "/api/rate_use_case",
                {
                    "se_email": se_email,
                    "poc_uid": poc_uid,
                    "poc_name": f"{customer_name} – Rated Use Cases",
                    "customer_name": customer_name,
                    "partner": random.choice(PARTNERS),
                    "use_case_code": code,
                    "version": 1,
                    "rating": rating,
                    "text": text,
                },
            )

    # ------------------------------------------------------------------
    # 2) Add feedback + questions on various "interesting" use cases
    # ------------------------------------------------------------------
    interesting_codes = [
        "Single-Sign-On",
        "Certificate-Validation",
        "Internet-Discovery",
        "Internal-Discovery",
        "Auto-Renewal",
        "Dashboard",
        "Kubernetes-Cert-Manager-Integration",
        "Azure-Key-Vault-Integration",
        "ServiceNow-Integration",
        "Role-Based-Access-Control",
        "Certificate-Policy-Enforcement",
    ]

    for poc in all_pocs:
        se_email = poc["se_email"]
        customer_name = poc["customer_name"]
        poc_uid = poc["poc_uid"]

        codes_here = [
            uc["code"]
            for uc in poc["use_cases"]
            if uc["code"] in interesting_codes
        ]
        if not codes_here:
            continue

        for code in random.sample(codes_here, k=min(2, len(codes_here))):
            fb_text = random.choice(FEEDBACK_TEXTS)
            fb_rating = random.choice([3, 4, 5])

            print(f"[SEED] /api/comment feedback {code} for {poc_uid}")
            post(
                "/api/comment",
                {
                    "se_email": se_email,
                    "poc_uid": poc_uid,
                    "poc_name": f"{customer_name} – Feedback",
                    "customer_name": customer_name,
                    "partner": random.choice(PARTNERS),
                    "use_case_code": code,
                    "version": 1,
                    "kind": "feedback",
                    "rating": fb_rating,
                    "text": fb_text,
                },
            )

            q_text = random.choice(QUESTION_TEXTS)
            print(f"[SEED] /api/comment question {code} for {poc_uid}")
            post(
                "/api/comment",
                {
                    "se_email": se_email,
                    "poc_uid": poc_uid,
                    "poc_name": f"{customer_name} – Questions",
                    "customer_name": customer_name,
                    "partner": random.choice(PARTNERS),
                    "use_case_code": code,
                    "version": 1,
                    "kind": "question",
                    "rating": None,
                    "text": q_text,
                },
            )

    print("[SEED] Done – demo data created.")


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
    seed_demo_data()