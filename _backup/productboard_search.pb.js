// pb_hooks/productboard_search.pb.js
// ProductBoard Search & Filter Routes

console.log("[ProductBoard] Loading search routes...");

// Test endpoint
routerAdd("GET", "/api/productboard/test", (c) => {
    console.log("[ProductBoard] Test endpoint called");
    
    try {
        const response = global.ProductBoard.call("/features", "GET");
        
        if (response.statusCode !== 200) {
            return c.json(500, { 
                error: "ProductBoard API error", 
                status: response.statusCode 
            });
        }
        
        const data = JSON.parse(response.raw);
        const features = data.data || [];
        
        return c.json(200, {
            success: true,
            message: "ProductBoard connection working!",
            totalFeatures: features.length,
            samples: features.slice(0, 3).map((f) => f.name)
        });
    } catch (error) {
        console.error("[ProductBoard] Test error:", error);
        return c.json(500, { error: String(error) });
    }
});

// Search features
routerAdd("GET", "/api/productboard/search", (c) => {
    console.log("[ProductBoard] Search endpoint called");
    
    const query = (c.queryParam("query") || "").toLowerCase().trim();
    const product = (c.queryParam("product") || "").toLowerCase().trim();
    
    try {
        const response = global.ProductBoard.call("/features", "GET");
        
        if (response.statusCode !== 200) {
            return c.json(500, { error: "ProductBoard API error" });
        }
        
        const data = JSON.parse(response.raw);
        let features = data.data || [];
        
        // Filter by product
        if (product.length >= 2) {
            features = features.filter((f) => {
                const p = (f.product?.name || "").toLowerCase();
                return p.indexOf(product) >= 0;
            });
        }
        
        // Filter by search query
        if (query.length >= 2) {
            features = features.filter((f) => {
                const name = (f.name || "").toLowerCase();
                const desc = (f.description || "").toLowerCase();
                return name.indexOf(query) >= 0 || desc.indexOf(query) >= 0;
            });
        }
        
        // Transform to our format
        const transformed = features.map((f) => ({
            id: f.id,
            title: f.name || "",
            description: f.description || "",
            type: f.type || "",
            status: f.status?.name || "unknown",
            url: f.links?.html || "",
            product: f.product?.name || "",
            owner: f.owner?.email || "",
            updatedAt: f.updatedAt || null
        }));
        
        console.log("[ProductBoard] Search returned", transformed.length, "results");
        
        return c.json(200, { data: transformed });
    } catch (error) {
        console.error("[ProductBoard] Search error:", error);
        return c.json(500, { error: String(error) });
    }
});

// Get products list
routerAdd("GET", "/api/productboard/products", (c) => {
    console.log("[ProductBoard] Products endpoint called");
    
    try {
        const response = global.ProductBoard.call("/features", "GET");
        
        if (response.statusCode !== 200) {
            return c.json(500, { error: "ProductBoard API error" });
        }
        
        const data = JSON.parse(response.raw);
        const features = data.data || [];
        
        // Extract unique products
        const productsSet = {};
        features.forEach((f) => {
            if (f.product?.name) {
                productsSet[f.product.name] = true;
            }
        });
        
        const products = Object.keys(productsSet).sort();
        
        console.log("[ProductBoard] Found", products.length, "products");
        
        return c.json(200, { data: products });
    } catch (error) {
        console.error("[ProductBoard] Products error:", error);
        return c.json(500, { error: String(error) });
    }
});

// Get recent features
routerAdd("GET", "/api/productboard/recent", (c) => {
    console.log("[ProductBoard] Recent endpoint called");
    
    const limit = parseInt(c.queryParam("limit") || "10");
    
    try {
        const response = global.ProductBoard.call("/features", "GET");
        
        if (response.statusCode !== 200) {
            return c.json(500, { error: "ProductBoard API error" });
        }
        
        const data = JSON.parse(response.raw);
        let features = data.data || [];
        
        // Sort by updatedAt descending
        features.sort((a, b) => {
            const dateA = new Date(a.updatedAt || 0);
            const dateB = new Date(b.updatedAt || 0);
            return dateB - dateA;
        });
        
        // Take top N
        features = features.slice(0, limit);
        
        // Transform
        const transformed = features.map((f) => ({
            id: f.id,
            title: f.name || "",
            status: f.status?.name || "unknown",
            product: f.product?.name || "",
            updatedAt: f.updatedAt
        }));
        
        console.log("[ProductBoard] Returning", transformed.length, "recent features");
        
        return c.json(200, { data: transformed });
    } catch (error) {
        console.error("[ProductBoard] Recent error:", error);
        return c.json(500, { error: String(error) });
    }
});

console.log("[ProductBoard] Search routes loaded");