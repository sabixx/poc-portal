// pb_hooks/productboard_client.pb.js
// Shared ProductBoard client helpers (used by multiple *.pb.js hook files)

const PRODUCTBOARD_API = "https://api.productboard.com";


function getProductBoardToken() {
    // PocketBase picks up env vars (including from .env) and exposes them here
    const token = $os.getenv("PRODUCTBOARD_TOKEN") || "";

    if (!token) {
        console.error("[ProductBoard] ERROR: PRODUCTBOARD_TOKEN env var is not set!");
        throw new Error("PRODUCTBOARD_TOKEN env var is not set");
    }

    return token;
}

// ───────────────────────────────────────────────────────────────
// Low-level HTTP wrapper
// ───────────────────────────────────────────────────────────────
function callProductBoard(endpoint, method, body) {
    const token = getProductBoardToken();
    const options = {
        url: PRODUCTBOARD_API + endpoint,
        method: method || "GET",
        headers: {
            "Authorization": "Bearer " + token,
            "X-Version": "1",
            "Content-Type": "application/json",
        },
        timeout: 15,
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    return $http.send(options);
}

// ───────────────────────────────────────────────────────────────
// Importance mapping helper
// ───────────────────────────────────────────────────────────────
function mapImportance(importance) {
    const map = {
        critical: "critical",
        important: "important",
        nice_to_have: "nice-to-have",
        not_important: "not-important",
        unknown: "unknown",
    };

    return map[importance] || "unknown";
}

// ───────────────────────────────────────────────────────────────
// Simple in-memory cache for /features
// Shared by search/products/recent endpoints
// ───────────────────────────────────────────────────────────────

// Cache config – tweak TTL as you like (ms)
const FEATURES_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cached state (lives in the PocketBase process)
let cachedFeatures = null;
let cachedFeaturesAt = 0;

function getAllFeaturesCached() {
    const now = Date.now();

    // Return cached list if still fresh
    if (cachedFeatures && (now - cachedFeaturesAt) < FEATURES_TTL_MS) {
        return cachedFeatures;
    }

    // Otherwise, fetch from Productboard
    const resp = callProductBoard("/features", "GET");
    if (resp.statusCode !== 200) {
        throw new Error("Productboard /features error: " + resp.statusCode);
    }

    const parsed = JSON.parse(resp.raw || "{}");
    cachedFeatures = parsed.data || [];
    cachedFeaturesAt = now;

    return cachedFeatures;
}

// Optional: helper to force cache refresh (for a “Refresh from Productboard” button)
function invalidateFeaturesCache() {
    cachedFeatures = null;
    cachedFeaturesAt = 0;
}

// ───────────────────────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────────────────────
module.exports = {
    callProductBoard,
    mapImportance,
    getAllFeaturesCached,
    invalidateFeaturesCache,
};
