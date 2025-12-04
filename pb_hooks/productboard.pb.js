// pb_hooks/productboard.pb.js
// ProductBoard Integration – main entry (version, health, test)

console.log("[ProductBoard v0.0.1 Main hook loading...");

// Health endpoint (you said you want to keep this here)
routerAdd("GET", "/api/productboard/health", (c) => {
    return c.json(200, {
        status: "ok",
        version: "v0.0.1",
        service: "productboard",
    });
});

// Test endpoint (also stays in main file)
routerAdd("GET", "/api/productboard/test", (c) => {
    console.log("[ProductBoard] Test called");

    try {
        const { callProductBoard } = require(__hooks + "/productboard_client.js");

        const response = callProductBoard("/features", "GET");

        if (response.statusCode !== 200) {
            return c.json(500, {
                error: "ProductBoard API error",
                status: response.statusCode,
            });
        }

        //const data = JSON.parse(response.raw || "{}");
        //const features = data.data || [];
        const { getAllFeaturesCached } = require(__hooks + "/productboard_client.js");
        let features = getAllFeaturesCached();

        return c.json(200, {
            success: true,
            message: "ProductBoard working!",
            totalFeatures: features.length,
            samples: features.slice(0, 3).map((f) => f.name),
        });
    } catch (error) {
        console.error("[ProductBoard] Test error:", error);
        return c.json(500, { error: String(error) });
    }
});

console.log("[ProductBoard v0.0.1 Main routes registered");
