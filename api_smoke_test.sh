#!/usr/bin/env bash

# --- 0) Health / smoke tests --------------------------------------

# If you still have a health endpoint:
echo "# Health"
curl -s "http://localhost:8090/api/productboard/health" | jq
echo

# Test Productboard connectivity
echo "# /api/productboard/test"
curl -s "http://localhost:8090/api/productboard/test" | jq
echo


# --- 1) SEARCH endpoint (uses getAllFeaturesCached) ----------------

echo "# Search 1: simple query"
curl -s "http://localhost:8090/api/productboard/search?query=sample" | jq '.data | length'
echo

echo "# Search 2: query + exact product name"
curl -s "http://localhost:8090/api/productboard/search?query=sample&product=Certificate%20Manager%20SaaS" | jq
echo

echo "# Search 3: partial product name"
curl -s "http://localhost:8090/api/productboard/search?query=sample&product=Certificate" | jq
echo

echo "# Search 4: see titles + products for broad query"
curl -s "http://localhost:8090/api/productboard/search?query=a" | jq '.data[] | {title, product}'
echo


# --- 2) PRODUCTS endpoint (uses getAllFeaturesCached) --------------

echo "# Products list (derived from features)"
curl -s "http://localhost:8090/api/productboard/products" | jq
echo


# --- 3) RECENT endpoint (uses getAllFeaturesCached) ----------------

echo "# Recent 1: default (no limit param)"
curl -s "http://localhost:8090/api/productboard/recent" | jq
echo

echo "# Recent 2: explicit limit=5"
curl -s "http://localhost:8090/api/productboard/recent?limit=5" | jq
echo


# --- 4) FEATURE DETAIL (no cache, but good sanity check) -----------

# Replace with any real feature ID you know works:
FEATURE_ID="a5d9aa88-377e-48b7-a852-5c32dd25264c"

echo "# Feature detail (with componentId/productId/product name)"
curl -s "http://localhost:8090/api/productboard/features/${FEATURE_ID}" | jq
echo


# --- 5) CREATE INSIGHT (POST body handled in hook) -----------------

echo "# Create an insight"
curl -s -X POST "http://localhost:8090/api/productboard/insights" \
  -H "Content-Type: application/json" \
  -d '{
    "featureId": "'"${FEATURE_ID}"'",
    "insightText": "Test insight from PocketBase integration (cached features).",
    "importance": "nice_to_have",
    "customerName": "Demo Customer",
    "pocName": "Demo POC"
  }' | jq
echo
