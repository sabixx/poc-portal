// pb_hooks/productboard_products.pb.js
// /api/productboard/products

console.log("[ProductBoard v0.0.3] Products hook loading...");

routerAdd("GET", "/api/productboard/products", (c) => {
    console.log("[ProductBoard] /api/productboard/products called");

    const { callProductBoard } = require(__hooks + "/productboard_client.js");

    try {
        // ✅ Call Productboard /products (same as your working fetch)
        const response = callProductBoard("/products", "GET");

        console.log("[ProductBoard] /products status:", response.statusCode);
        // Log a bit of the raw response for debugging
        console.log(
            "[ProductBoard] /products raw (first 500 chars):",
            String(response.raw || "").substring(0, 500)
        );

        if (response.statusCode !== 200) {
            // If this happens, your token / base URL / space is wrong
            return c.json(500, {
                error: "Productboard API error",
                statusCode: response.statusCode,
            });
        }

        let data;
        try {
            data = JSON.parse(response.raw || "{}");
        } catch (e) {
            console.error("[ProductBoard] Failed to parse /products JSON:", e);
            return c.json(500, { error: "Invalid JSON from Productboard" });
        }

        const products = Array.isArray(data.data) ? data.data : [];
        console.log("[ProductBoard] Products returned:", products.length);
        if (products[0]) {
            console.log("[ProductBoard] First product object:", products[0]);
        }

        // Return full product objects (id + name) for feature creation
        const productList = products
            .filter((p) => p && p.name && p.id)
            .map((p) => ({ id: p.id, name: p.name }))
            .sort((a, b) => a.name.localeCompare(b.name));

        console.log("[ProductBoard] Product list:", productList.map(p => p.name));

        return c.json(200, {
            data: productList,
        });
    } catch (error) {
        console.error("[ProductBoard] Products hook error:", error);
        return c.json(500, { error: String(error) });
    }
});

console.log("[ProductBoard v0.0.3] Products routes registered");
