// pb_hooks/productboard_insights.pb.js
console.log("[ProductBoard 0.0.2] Insights hook loading...");

routerAdd("POST", "/api/productboard/insights", (e) => {
    console.log("[ProductBoard] Create insight called");

    try {
        const { callProductBoard, mapImportance } = require(__hooks + "/productboard_client.js");

        // New way: read body via e.requestInfo().body
        const info = e.requestInfo();
        const body = info.body || {};

        const featureId    = body.featureId;
        const insightText  = body.insightText || "";
        const importance   = body.importance || "unknown";
        const customerName = body.customerName || "";
        const pocName      = body.pocName || "";
        const useCaseName  = body.useCaseName || "";

        if (!insightText || insightText.trim().length === 0) {
            return e.json(400, { error: "Insight text cannot be empty" });
        }

        const pbImportance = mapImportance(importance);

        const notePayload = {
            title: customerName + " - " + (useCaseName || pocName),
            content: insightText,
            importance: pbImportance,
            customerName: customerName,
        };

        const response = callProductBoard("/notes", "POST", notePayload);

        if (response.statusCode !== 200 && response.statusCode !== 201) {
            console.error("[ProductBoard] Create note error:", response.statusCode, response.raw);
            return e.json(500, { error: "Failed to create insight" });
        }

        const noteData = JSON.parse(response.raw || "{}");
        const noteId = noteData.data && noteData.data.id ? noteData.data.id : null;

        if (noteId && featureId) {
            try {
                callProductBoard("/notes/" + noteId + "/links/features", "POST", { featureId: featureId });
            } catch (linkErr) {
                console.error("[ProductBoard] Link note->feature error:", linkErr);
            }
        }

        return e.json(200, {
            success: true,
            insightId: noteId,
            message: "Insight created",
        });
    } catch (error) {
        console.error("[ProductBoard] Create insight error:", error);
        return e.json(500, { error: String(error) });
    }
});

console.log("[ProductBoard 0.0.2] Insights routes registered");
