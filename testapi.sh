#!/bin/bash
# =============================================================================
# POC Portal API - Test Commands (FIXED - all single-line JSON)
# =============================================================================
#
# Usage: 
#   export API_SHARED_SECRET="supersecret-api-key"
#   ./test_api.sh
#
# Environment Variables:
#   API_BASE          - API server URL (default: http://localhost:8000)
#   API_SHARED_SECRET - If set, adds X-Api-Key header to all requests
# =============================================================================

API_BASE="${API_BASE:-http://localhost:8000}"
API_KEY="${API_SHARED_SECRET:-}"

echo "Testing POC Portal API at: $API_BASE"
if [ -n "$API_KEY" ]; then
    echo "Using X-Api-Key authentication"
fi
echo "============================================="
echo ""

# Helper function to make authenticated requests
do_curl() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    
    if [ -n "$API_KEY" ]; then
        if [ -n "$data" ]; then
            curl -s -X "$method" "$API_BASE$endpoint" \
                -H "Content-Type: application/json" \
                -H "X-Api-Key: $API_KEY" \
                -d "$data"
        else
            curl -s -X "$method" "$API_BASE$endpoint" \
                -H "X-Api-Key: $API_KEY"
        fi
    else
        if [ -n "$data" ]; then
            curl -s -X "$method" "$API_BASE$endpoint" \
                -H "Content-Type: application/json" \
                -d "$data"
        else
            curl -s -X "$method" "$API_BASE$endpoint"
        fi
    fi
}

# -----------------------------------------------------------------------------
# 1. Health Check
# -----------------------------------------------------------------------------
echo "1. Health Check"
echo "---------------"
do_curl GET "/api/health" | jq .
echo ""

# -----------------------------------------------------------------------------
# 2. Register a new POC
# -----------------------------------------------------------------------------
echo "2. Register POC"
echo "---------------"
REGISTER_JSON='{"sa_name":"Jens Sabitzer","sa_email":"jens.sabitzer@cyberark.com","prospect":"ACME Bank","product":"Certificate Manager SaaS","partner":"BigPartner GmbH","poc_start_date":"2025-12-04","poc_end_date":"2026-01-03"}'
REGISTER_RESULT=$(do_curl POST "/api/register" "$REGISTER_JSON")
echo "$REGISTER_RESULT" | jq .

# Extract poc_uid for subsequent calls
POC_UID=$(echo "$REGISTER_RESULT" | jq -r '.poc_uid // empty')
if [ -n "$POC_UID" ]; then
    echo "  -> Captured POC_UID: $POC_UID"
else
    echo "  -> WARNING: Could not capture POC_UID, using placeholder"
    POC_UID="POC-PLACEHOLDER"
fi
echo ""

# -----------------------------------------------------------------------------
# 3. Register again (should return existing POC)
# -----------------------------------------------------------------------------
echo "3. Register again (should find existing)"
echo "-----------------------------------------"
REGISTER2_JSON='{"sa_email":"jens.sabitzer@cyberark.com","prospect":"ACME Bank","product":"Certificate Manager SaaS"}'
do_curl POST "/api/register" "$REGISTER2_JSON" | jq .
echo ""

# -----------------------------------------------------------------------------
# 4. Heartbeat with use cases
# -----------------------------------------------------------------------------
echo "4. Heartbeat"
echo "------------"
HEARTBEAT_JSON='{"poc_uid":"'"$POC_UID"'","active_use_cases":["machine-identity/welcome","machine-identity/dashboard","machine-identity/internet-discovery","machine-identity/setup-and-overview"],"completed_use_cases":["machine-identity/welcome","machine-identity/dashboard"]}'
do_curl POST "/api/heartbeat" "$HEARTBEAT_JSON" | jq .
echo ""

# -----------------------------------------------------------------------------
# 5. Mark use case as completed
# -----------------------------------------------------------------------------
echo "5. Complete Use Case"
echo "--------------------"
COMPLETE_JSON='{"poc_uid":"'"$POC_UID"'","use_case_code":"machine-identity/internet-discovery","completed":true}'
do_curl POST "/api/complete_use_case" "$COMPLETE_JSON" | jq .
echo ""

# -----------------------------------------------------------------------------
# 6. Uncheck use case completion
# -----------------------------------------------------------------------------
echo "6. Uncheck Use Case Completion"
echo "------------------------------"
UNCOMPLETE_JSON='{"poc_uid":"'"$POC_UID"'","use_case_code":"machine-identity/internet-discovery","completed":false}'
do_curl POST "/api/complete_use_case" "$UNCOMPLETE_JSON" | jq .
echo ""

# -----------------------------------------------------------------------------
# 7. Set rating for use case
# -----------------------------------------------------------------------------
echo "7. Set Rating"
echo "-------------"
RATING_JSON='{"poc_uid":"'"$POC_UID"'","use_case_code":"machine-identity/dashboard","rating":5}'
do_curl POST "/api/rating" "$RATING_JSON" | jq .
echo ""

# -----------------------------------------------------------------------------
# 8. Submit feedback for use case
# -----------------------------------------------------------------------------
echo "8. Submit Feedback"
echo "------------------"
FEEDBACK_JSON='{"poc_uid":"'"$POC_UID"'","use_case_code":"machine-identity/dashboard","text":"Great feature! The dashboard provides excellent visibility."}'
do_curl POST "/api/feedback" "$FEEDBACK_JSON" | jq .
echo ""

# -----------------------------------------------------------------------------
# 9. Deregister POC (for demo cleanup) - SKIP for now
# -----------------------------------------------------------------------------
echo "9. Deregister POC (skipped - uncomment to test)"
echo "------------------------------------------------"
echo "# Uncomment the following to test deregistration:"
echo " DEREG_JSON='{\"poc_uid\":\"$POC_UID\"}'"
echo " do_curl POST \"/api/deregister\" \"\$DEREG_JSON\" | jq ."
echo ""

# =============================================================================
# Error Cases (for testing validation)
# =============================================================================

echo ""
echo "============================================="
echo "Error Cases"
echo "============================================="
echo ""

# Missing required fields
echo "Missing required fields:"
ERROR1_JSON='{"sa_email":"test@example.com"}'
do_curl POST "/api/register" "$ERROR1_JSON" | jq .
echo ""

# Invalid rating
echo "Invalid rating (out of range):"
ERROR2_JSON='{"poc_uid":"'"$POC_UID"'","use_case_code":"machine-identity/dashboard","rating":10}'
do_curl POST "/api/rating" "$ERROR2_JSON" | jq .
echo ""

# POC not found
echo "POC not found:"
ERROR3_JSON='{"poc_uid":"POC-NONEXISTENT","active_use_cases":[],"completed_use_cases":[]}'
do_curl POST "/api/heartbeat" "$ERROR3_JSON" | jq .
echo ""

echo "============================================="
echo "Tests completed!"
echo "============================================="