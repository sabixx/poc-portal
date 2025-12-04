// pb_hooks/productboard_insights.pb.js
// ProductBoard Insight Creation Routes

console.log("[ProductBoard] Loading insights routes...");

// Create insight/note in ProductBoard
routerAdd("POST", "/api/productboard/insights", (c) => {
    console.log("[ProductBoard] Create insight endpoint called");
    
    try {
        const body = $apis.requestInfo(c).data;
        
        const featureId = body.featureId;
        const insightText = body.insightText || "";
        const importance = body.importance || "unknown";
        const customerName = body.customerName || "";
        const pocName = body.pocName || "";
        const useCaseName = body.useCaseName || "";
        
        // Validate insight text
        if (!insightText || insightText.trim().length === 0) {
            console.error("[ProductBoard] Insight text is empty");
            return c.json(400, { 
                error: "Insight text cannot be empty",
                message: "ProductBoard requires a note with content"
            });
        }
        
        // Map importance to ProductBoard format
        const pbImportance = global.ProductBoard.mapImportance(importance);
        
        // Build note payload
        const notePayload = {
            title: customerName + " - " + (useCaseName || pocName),
            content: insightText,
            importance: pbImportance,
            customerName: customerName
        };
        
        console.log("[ProductBoard] Creating note:", notePayload.title);
        
        // Create note in ProductBoard
        const response = global.ProductBoard.call("/notes", "POST", notePayload);
        
        if (response.statusCode !== 200 && response.statusCode !== 201) {
            console.error("[ProductBoard] Create note error. Status:", response.statusCode);
            console.error("[ProductBoard] Response:", response.raw);
            return c.json(500, { 
                error: "Failed to create insight in ProductBoard",
                status: response.statusCode
            });
        }
        
        const noteData = JSON.parse(response.raw);
        const noteId = noteData.data?.id || null;
        
        console.log("[ProductBoard] Note created:", noteId);
        
        // Link note to feature
        if (noteId && featureId) {
            console.log("[ProductBoard] Linking note to feature:", featureId);
            
            const linkPayload = { featureId: featureId };
            const linkResponse = global.ProductBoard.call(
                "/notes/" + noteId + "/links/features", 
                "POST", 
                linkPayload
            );
            
            if (linkResponse.statusCode !== 200 && linkResponse.statusCode !== 201) {
                console.error("[ProductBoard] Link note to feature error:", linkResponse.raw);
                // Don't fail - note was created, just couldn't link
            } else {
                console.log("[ProductBoard] Note linked to feature successfully");
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
            message: String(error)
        });
    }
});

console.log("[ProductBoard] Insights routes loaded");