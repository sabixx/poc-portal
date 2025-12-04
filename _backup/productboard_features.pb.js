// pb_hooks/productboard_features.pb.js
// ProductBoard Feature Details Routes

console.log("[ProductBoard] Loading features routes...");

// Get specific feature by ID
routerAdd("GET", "/api/productboard/features/:featureId", (c) => {
    console.log("[ProductBoard] Get feature endpoint called");
    
    const featureId = c.pathParam("featureId");
    
    try {
        const response = global.ProductBoard.call("/features/" + featureId, "GET");
        
        if (response.statusCode !== 200) {
            return c.json(500, { error: "ProductBoard API error" });
        }
        
        const data = JSON.parse(response.raw);
        const f = data.data;
        
        const transformed = {
            id: f.id,
            title: f.name || "",
            description: f.description || "",
            type: f.type || "",
            status: f.status?.name || "unknown",
            url: f.links?.html || "",
            product: f.product?.name || "",
            owner: f.owner?.email || "",
            release: f.release?.name || "",
            releaseDate: f.release?.released_at || null,
            timeframe: f.timeframe || null,
            updatedAt: f.updatedAt || null
        };
        
        console.log("[ProductBoard] Returning feature:", f.name);
        
        return c.json(200, transformed);
    } catch (error) {
        console.error("[ProductBoard] Get feature error:", error);
        return c.json(500, { error: String(error) });
    }
});

console.log("[ProductBoard] Features routes loaded");