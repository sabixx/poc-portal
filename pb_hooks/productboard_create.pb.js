// pb_hooks/productboard_create.pb.js
// Create new feature in ProductBoard
console.log("[ProductBoard 1.0] Create feature hook loading...");

routerAdd("POST", "/api/productboard/features", (e) => {
  console.log("[ProductBoard] Create feature called");

  try {
    const { callProductBoard, invalidateFeaturesCache } = require(__hooks + "/productboard_client.js");

    // Read request body via requestInfo (PocketBase way)
    const info = e.requestInfo();
    const body = info.body || {};

    console.log("[ProductBoard] Received request body:", JSON.stringify(body));

    const title = (body.title || "").trim();
    const description = (body.description || "").trim();
    const productId = (body.productId || "").trim();
    const productName = (body.productName || "").trim();

    console.log("[ProductBoard] Creating feature:", JSON.stringify({ title, description, productId, productName }));

    // Validate required fields
    if (!title) {
      return e.json(400, { error: "Title is required" });
    }

    if (!productId) {
      return e.json(400, { error: "Product is required" });
    }

    // Build ProductBoard feature payload
    // ProductBoard API requires: name, type, parent
    // Description must be HTML, wrap in <p> tags if plain text
    let htmlDescription = "";
    if (description) {
      // If already has HTML tags, use as-is; otherwise wrap in <p>
      if (description.includes("<")) {
        htmlDescription = description;
      } else {
        htmlDescription = "<p>" + description + "</p>";
      }
    }

    // Status ID for "New idea" - from ProductBoard API
    const NEW_IDEA_STATUS_ID = "a3e28398-3b72-4367-8850-56bedbccfbdf";

    const featurePayload = {
      data: {
        name: title,
        description: htmlDescription,
        type: "feature",
        status: {
          id: NEW_IDEA_STATUS_ID
        },
        parent: {
          product: {
            id: productId
          }
        }
      }
    };

    console.log("[ProductBoard] Sending payload:", JSON.stringify(featurePayload));

    // Create the feature in ProductBoard
    const resp = callProductBoard("/features", "POST", featurePayload);

    console.log("[ProductBoard] Create response status:", resp.statusCode);
    console.log("[ProductBoard] Create response body:", resp.raw);

    if (resp.statusCode !== 201 && resp.statusCode !== 200) {
      console.error("[ProductBoard] Create feature error:", resp.statusCode);
      console.error("[ProductBoard] Error response:", resp.raw);
      return e.json(resp.statusCode || 500, {
        error: "ProductBoard API error",
        status: resp.statusCode,
        details: resp.raw
      });
    }

    let createdFeature;
    try {
      const parsed = JSON.parse(resp.raw || "{}");
      createdFeature = parsed.data || parsed;
    } catch (err) {
      console.error("[ProductBoard] JSON parse error:", err);
      return e.json(500, { error: "Failed to parse ProductBoard response" });
    }

    console.log("[ProductBoard] Feature created:", createdFeature.id);

    // Invalidate cache so new feature shows up in searches
    invalidateFeaturesCache();

    // Return the created feature in a normalized format
    return e.json(201, {
      id: createdFeature.id,
      title: createdFeature.name || title,
      description: createdFeature.description || description,
      status: createdFeature.status?.name || "new idea",
      url: createdFeature.links?.html || "",
      product: productName,
      createdAt: createdFeature.createdAt || new Date().toISOString()
    });

  } catch (error) {
    console.error("[ProductBoard] Create feature error:", error);
    return e.json(500, { error: String(error) });
  }
});

console.log("[ProductBoard 1.0] Create feature route registered");
