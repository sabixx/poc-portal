// pb_hooks/productboard_recent.pb.js
console.log("[ProductBoard 0.0.4] Recent hook loading...");

routerAdd("GET", "/api/productboard/recent", (e) => {
  console.log("[ProductBoard] Recent called");

  try {
    const { getAllFeaturesCached } = require(__hooks + "/productboard_client.js");

    const urlQuery = e.request.url.query();
    const limitRaw = urlQuery.get("limit") || "5";
    let limit = parseInt(limitRaw, 10) || 5;

    // Hard limit to 5 as requested
    if (limit > 5) {
      limit = 5;
    }

    // 1) Get all features (cached)
    let features = getAllFeaturesCached() || [];

    // 2) Sort by updatedAt desc
    features.sort((a, b) => {
      const aDate = a.updatedAt ? new Date(a.updatedAt) : new Date(0);
      const bDate = b.updatedAt ? new Date(b.updatedAt) : new Date(0);
      return bDate - aDate;
    });

    // 3) Take top N (max 5)
    features = features.slice(0, limit);

    const enriched = [];

    // 4) For each recent feature, call our own local enriched API
    for (let i = 0; i < features.length; i++) {
      const base = features[i];
      const featureId = base.id;

      // Start with some sane defaults from the raw feature
      const item = {
        id: featureId,
        title: base.name || "",
        description: base.description || "",
        status: (base.status && base.status.name) ? base.status.name : "unknown",
        product: "",
        updatedAt: base.updatedAt || null,
        url: (base.links && base.links.html) ? base.links.html : "",
      };

      try {
        // Call our *local* enriched endpoint:
        // GET http://localhost:8090/api/productboard/features/{id}
        const localResp = $http.send({
          url: "http://127.0.0.1:8090/api/productboard/features/" + featureId,
          method: "GET",
          timeout: 10,
        });

        if (localResp.statusCode === 200) {
          const localJson = JSON.parse(localResp.raw || "{}");

          // Overwrite description + product from enriched data
          if (localJson.description) {
            item.description = localJson.description;
          }
          if (localJson.product) {
            item.product = localJson.product;
          }
        } else {
          console.error(
            "[ProductBoard] Local feature-enrich error:",
            featureId,
            localResp.statusCode,
            localResp.raw
          );
        }
      } catch (innerErr) {
        console.error(
          "[ProductBoard] Local feature-enrich exception:",
          featureId,
          innerErr
        );
      }

      enriched.push(item);
    }

    // 5) Return only the enriched list
    return e.json(200, { data: enriched });
  } catch (error) {
    console.error("[ProductBoard] Recent error:", error);
    return e.json(500, { error: String(error) });
  }
});

console.log("[ProductBoard 0.0.4] Recent routes registered");
