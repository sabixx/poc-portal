// pb_hooks/productboard_search.pb.js
console.log("[ProductBoard 0.4.1] Search hook loading...");

routerAdd("GET", "/api/productboard/search", (e) => {
  console.log("[ProductBoard] Search called");

  try {
    const { callProductBoard } = require(__hooks + "/productboard_client.js");

    const urlQuery = e.request.url.query();
    const queryParam   = (urlQuery.get("query")   || "").trim();
    const productParam = (urlQuery.get("product") || "").trim();

    const query   = queryParam.toLowerCase();
    const product = productParam.toLowerCase();

    console.log("[ProductBoard] Incoming search params:", {
      query: queryParam,
      product: productParam,
    });

    // 1) Get all features from Productboard (raw)
    const resp = callProductBoard("/features", "GET");
    if (resp.statusCode !== 200) {
      console.error("[ProductBoard] /features error:", resp.statusCode, resp.raw);
      return e.json(500, { error: "API error", status: resp.statusCode });
    }

    let parsed;
    try {
      parsed = JSON.parse(resp.raw || "{}");
    } catch (err) {
      console.error("[ProductBoard] JSON parse error:", err);
      return e.json(500, { error: "JSON parse error" });
    }

    let features = Array.isArray(parsed.data) ? parsed.data : [];
    console.log("[ProductBoard] features total from PB:", features.length);

    // 2) Filter by query (name/description) only
    if (query.length >= 2) {
      const before = features.length;

      features = features.filter((f) => {
        const name = (f.name || "").toLowerCase();
        const desc = (f.description || "").toLowerCase();
        return name.includes(query) || desc.includes(query);
      });

      console.log(
        "[ProductBoard] After query filter",
        `(${queryParam})`,
        ":", features.length, "/", before
      );
    }

    // 3) Limit to first 20 before enrichment
    const MAX_RESULTS = 20;
    if (features.length > MAX_RESULTS) {
      console.log(
        `[ProductBoard] Limiting query-matched features to first ${MAX_RESULTS}`
      );
      features = features.slice(0, MAX_RESULTS);
    }

    // 4) Helper: call YOUR existing internal API for product info
    function getInternalFeatureMeta(featureId) {
      // use your own API as requested
      const url = `http://127.0.0.1:8090/api/productboard/features/${featureId}`;

      const res = $http.send({
        method: "GET",
        url: url,
        timeout: 5000,
      });

      // 🔥 IMPORTANT FIX: use res.statusCode, NOT res.code
      if (res.statusCode !== 200) {
        console.error(
          "[ProductBoard] Internal feature API error",
          featureId,
          res.statusCode,
          res.raw
        );
        return null;
      }

      try {
        const meta = JSON.parse(res.raw || "{}");
        return meta;
      } catch (err) {
        console.error(
          "[ProductBoard] Internal feature JSON error",
          featureId,
          err,
          res.raw
        );
        return null;
      }
    }

    const result = [];
    const useProductFilter = product.length >= 2;

    // 5) Enrich each with product info via your internal API
    for (const f of features) {
      const meta = getInternalFeatureMeta(f.id);
      if (!meta) {
        continue; // skip if enrichment failed
      }

      const productName = meta.product ? String(meta.product) : "";
      const pLower = productName.toLowerCase();

      if (useProductFilter) {
        if (!pLower || !pLower.includes(product)) {
          // requested product filter doesn't match → skip
          continue;
        }
      }

      result.push({
        id: f.id,
        title: f.name || "",
        description: f.description || "",
        type: f.type || "",
        status: (f.status && f.status.name) ? f.status.name : "unknown",
        url: (f.links && f.links.html) ? f.links.html : "",
        product: productName,                 // 👈 from your internal API
        owner: (f.owner && f.owner.email) ? f.owner.email : "",
        updatedAt: f.updatedAt || null,
      });
    }

    console.log(
      "[ProductBoard] Returning enriched search results:",
      result.length
    );

    return e.json(200, { data: result });
  } catch (error) {
    console.error("[ProductBoard] Search error:", error);
    return e.json(500, { error: String(error) });
  }
});

console.log("[ProductBoard 0.4.1] Search routes registered");
