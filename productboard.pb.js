// pb_hooks/productboard.pb.js
// ProductBoard API Proxy with Insight Creation

// CONFIGURATION - Your ProductBoard API Token
const PRODUCTBOARD_TOKEN = "eyJ0eXAiOiJKV1QiLCJraWQiOiI2ZDI0MmY3ZDgzZWNlYTNhYWJiZmVkYWE0YjE2YzFiYTZjZWIzMzMyYjhiN2MwYWVhYzM4Y2U0YTc2NTFhZTdhIiwiYWxnIjoiUlM1MTIifQ.eyJpYXQiOjE3NjQ0MTAyOTEsImlzcyI6ImNlZWQ5OTU2LTI1NWUtNGU4YS1hYWI5LWYyYWI0ZWJhZGM4MiIsInN1YiI6IjE1NjEwMjYiLCJyb2xlIjoiYWRtaW4iLCJhdWQiOiJodHRwczovL2FwaS5wcm9kdWN0Ym9hcmQuY29tIiwidXNlcl9pZCI6MTU2MTAyNiwic3BhY2VfaWQiOiIzNjA0MDQiLCJyZWdpb24iOiJ1cyJ9.jWskwnlsXCd2mKh3fifspsyAtWhUZDxARO2VKBCbyKGGtPnZKEB5vfZ65RPuUZki-qDtF2wD1F_Qs2HCeFSdyRpyhaA4M5V78uMY3qT-_nKrxsByi75NAPx3wczKP1w-aiUQMfrvMDnuFfYVOB83h0WRqsvYM3zmefINGrGR0bWqawGsduJ9JZZ6PcigAMwgc2e88b7T94ZGSJYlValg_d_GoIuho7gzp4sfseXkTGZA_7_FyIIiCiJo8nFbVY4_fML1V_WaCs7Aj3jpkCMIa3aOrO3R8i7-gSP-5gXarUGgklX5Is8-On_dPFhnzvUwxf4y75yzTUodr4bkm82o7Q";

// Map importance levels to ProductBoard API values
function mapImportanceToProductBoard(importance) {
    const mapping = {
        'critical': 'critical',
        'important': 'important', 
        'nice_to_have': 'nice-to-have',
        'not_important': 'not-important',
        'unknown': 'unknown'
    };
    return mapping[importance] || 'unknown';
}

// Test endpoint - no auth required
routerAdd("GET", "/api/productboard/test", (c) => {
    const token = PRODUCTBOARD_TOKEN;
    
    try {
        const response = $http.send({
            url: "https://api.productboard.com/features",
            headers: {
                "Authorization": "Bearer " + token,
                "X-Version": "1"
            },
            timeout: 15
        });

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
            message: "ProductBoard working!",
            totalFeatures: features.length,
            samples: features.slice(0, 3).map(function(f) {
                return f.name;
            })
        });
        
    } catch (error) {
        return c.json(500, { 
            error: "Request failed",
            message: error.message
        });
    }
});

// Search endpoint - no auth for testing
routerAdd("GET", "/api/productboard/search", (c) => {
    const token = PRODUCTBOARD_TOKEN;
    const searchQuery = (c.queryParam("query") || "").toLowerCase().trim();
    const productFilter = (c.queryParam("product") || "").toLowerCase().trim();

    try {
        const response = $http.send({
            url: "https://api.productboard.com/features",
            headers: {
                "Authorization": "Bearer " + token,
                "X-Version": "1"
            },
            timeout: 15
        });

        if (response.statusCode !== 200) {
            return c.json(500, { error: "ProductBoard API error" });
        }

        const data = JSON.parse(response.raw);
        let features = data.data || [];

        // Filter by product if specified
        if (productFilter && productFilter.length >= 2) {
            features = features.filter(function(f) {
                const product = (f.product?.name || "").toLowerCase();
                return product.indexOf(productFilter) >= 0;
            });
        }

        // Filter by search query
        if (searchQuery && searchQuery.length >= 2) {
            features = features.filter(function(f) {
                const name = (f.name || "").toLowerCase();
                const desc = (f.description || "").toLowerCase();
                return name.indexOf(searchQuery) >= 0 || desc.indexOf(searchQuery) >= 0;
            });
        }

        // Transform to our format
        const transformed = features.map(function(f) {
            return {
                id: f.id,
                title: f.name || "",
                description: f.description || "",
                type: f.type || "",
                status: f.status && f.status.name ? f.status.name : "unknown",
                url: f.links && f.links.html ? f.links.html : "",
                release: "",
                releaseDate: null,
                product: f.product && f.product.name ? f.product.name : "",
                priority: "medium",
                owner: f.owner && f.owner.email ? f.owner.email : ""
            };
        });

        return c.json(200, { data: transformed });
        
    } catch (error) {
        return c.json(500, { 
            error: "Search failed",
            message: error.message
        });
    }
});

// Create insight in ProductBoard
routerAdd("POST", "/api/productboard/insights", (c) => {
    const token = PRODUCTBOARD_TOKEN;
    
    try {
        const body = $apis.requestInfo(c).data;
        
        const featureId = body.featureId;
        const insightText = body.insightText || "";
        const importance = body.importance || "unknown";
        const customerName = body.customerName || "";
        const pocName = body.pocName || "";
        const useCaseName = body.useCaseName || "";
        const userName = body.userName || "";
        
        // Validate insight text is not empty
        if (!insightText || insightText.trim().length === 0) {
            return c.json(400, { 
                error: "Insight text cannot be empty",
                message: "ProductBoard requires a note with content"
            });
        }
        
        // Map importance to ProductBoard format
        const pbImportance = mapImportanceToProductBoard(importance);
        
        // Create note/insight in ProductBoard
        const notePayload = {
            title: customerName + " - " + (useCaseName || pocName),
            content: insightText,
            importance: pbImportance,
            customerName: customerName
        };
        
        const response = $http.send({
            url: "https://api.productboard.com/notes",
            method: "POST",
            headers: {
                "Authorization": "Bearer " + token,
                "X-Version": "1",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(notePayload),
            timeout: 15
        });
        
        if (response.statusCode !== 200 && response.statusCode !== 201) {
            console.error("[ProductBoard] Create note error:", response.raw);
            return c.json(500, { 
                error: "Failed to create insight in ProductBoard",
                status: response.statusCode,
                details: response.raw
            });
        }
        
        const noteData = JSON.parse(response.raw);
        const noteId = noteData.data ? noteData.data.id : null;
        
        // Link note to feature
        if (noteId && featureId) {
            const linkPayload = {
                featureId: featureId
            };
            
            const linkResponse = $http.send({
                url: "https://api.productboard.com/notes/" + noteId + "/links/features",
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "X-Version": "1",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(linkPayload),
                timeout: 15
            });
            
            if (linkResponse.statusCode !== 200 && linkResponse.statusCode !== 201) {
                console.error("[ProductBoard] Link note to feature error:", linkResponse.raw);
                // Don't fail - note was created, just couldn't link
            }
        }
        
        return c.json(200, { 
            success: true,
            insightId: noteId,
            message: "Insight created in ProductBoard"
        });
        
    } catch (error) {
        console.error("[ProductBoard] Create insight error:", error);
        return c.json(500, { 
            error: "Failed to create insight",
            message: error.message
        });
    }
});

// Get specific feature - no auth for testing
routerAdd("GET", "/api/productboard/features/:featureId", (c) => {
    const token = PRODUCTBOARD_TOKEN;
    const featureId = c.pathParam("featureId");

    try {
        const response = $http.send({
            url: "https://api.productboard.com/features/" + featureId,
            headers: {
                "Authorization": "Bearer " + token,
                "X-Version": "1"
            },
            timeout: 10
        });

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
            status: f.status && f.status.name ? f.status.name : "unknown",
            url: f.links && f.links.html ? f.links.html : "",
            release: "",
            releaseDate: null,
            product: f.product && f.product.name ? f.product.name : "",
            priority: "medium",
            owner: f.owner && f.owner.email ? f.owner.email : ""
        };

        return c.json(200, transformed);
        
    } catch (error) {
        return c.json(500, { 
            error: "Fetch failed",
            message: error.message
        });
    }
});

// Get recent feature requests (hot ERs)
routerAdd("GET", "/api/productboard/recent", (c) => {
    const token = PRODUCTBOARD_TOKEN;
    const limit = parseInt(c.queryParam("limit") || "10");

    try {
        const response = $http.send({
            url: "https://api.productboard.com/features",
            headers: {
                "Authorization": "Bearer " + token,
                "X-Version": "1"
            },
            timeout: 15
        });

        if (response.statusCode !== 200) {
            return c.json(500, { error: "ProductBoard API error" });
        }

        const data = JSON.parse(response.raw);
        let features = data.data || [];
        
        // Sort by updated date (most recent first)
        features.sort(function(a, b) {
            const dateA = new Date(a.updatedAt || 0);
            const dateB = new Date(b.updatedAt || 0);
            return dateB - dateA;
        });
        
        // Take top N
        features = features.slice(0, limit);

        // Transform to our format
        const transformed = features.map(function(f) {
            return {
                id: f.id,
                title: f.name || "",
                status: f.status && f.status.name ? f.status.name : "unknown",
                product: f.product && f.product.name ? f.product.name : "",
                updatedAt: f.updatedAt
            };
        });

        return c.json(200, { data: transformed });
        
    } catch (error) {
        return c.json(500, { 
            error: "Failed to get recent features",
            message: error.message
        });
    }
});