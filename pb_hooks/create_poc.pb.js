// pb_hooks/create_poc.pb.js
// Create new POC from UI for authenticated users
console.log("[Create POC Hook 1.1] Loading...");

routerAdd("POST", "/api/pocs/create", (e) => {
  console.log("[Create POC] Create POC endpoint called");

  try {
    // Get authenticated user
    const authRecord = e.auth;
    if (!authRecord) {
      console.log("[Create POC] No authenticated user");
      return e.json(401, { error: "Authentication required" });
    }

    console.log("[Create POC] Authenticated user:", authRecord.getString("email"));

    // Read request body
    const info = e.requestInfo();
    const body = info.body || {};

    console.log("[Create POC] Received request body:", JSON.stringify(body));

    const seEmail = (body.sa_email || "").trim().toLowerCase();
    const customerName = (body.prospect || "").trim();
    const product = (body.product || "").trim();
    const partner = (body.partner || "").trim();
    const aeb = (body.aeb || "").trim();
    const pocStartDate = body.poc_start_date || "";
    const pocEndDate = body.poc_end_date || "";

    // Validate required fields
    if (!seEmail) {
      return e.json(400, { error: "SE email is required" });
    }
    if (!customerName) {
      return e.json(400, { error: "Customer/prospect name is required" });
    }
    if (!product) {
      return e.json(400, { error: "Product is required" });
    }

    // Find SE user by email
    let seUser = null;
    let userCreated = false;

    try {
      seUser = e.app.findFirstRecordByData("users", "email", seEmail);
      console.log("[Create POC] Found existing SE user:", seUser.id);
    } catch (err) {
      console.log("[Create POC] SE user not found, will create:", seEmail);
    }

    if (!seUser) {
      // SE user doesn't exist - create them
      console.log("[Create POC] Creating new SE user:", seEmail);

      const usersCollection = e.app.findCollectionByNameOrId("users");
      const newUser = new Record(usersCollection);

      // Generate display name from email
      const emailPart = seEmail.split("@")[0];
      const nameParts = emailPart.split(".");
      let displayName = emailPart;
      if (nameParts.length >= 2) {
        displayName = nameParts.map(function(part) {
          return part.charAt(0).toUpperCase() + part.slice(1);
        }).join(" ");
      }

      // Generate random password
      const randomPassword = $security.randomString(16);

      newUser.set("email", seEmail);
      newUser.set("displayName", displayName);
      newUser.set("role", "se");
      newUser.setPassword(randomPassword);
      newUser.set("verified", true);

      e.app.save(newUser);
      seUser = newUser;
      userCreated = true;

      console.log("[Create POC] Created new SE user:", seUser.id);

      // Send password reset email
      try {
        e.app.sendRecordPasswordResetEmail(seUser);
        console.log("[Create POC] Password reset email sent to:", seEmail);
      } catch (emailErr) {
        console.error("[Create POC] Failed to send password reset email:", emailErr);
      }
    }

    const seId = seUser.id;

    // Check if POC already exists by composite key
    let existingPoc = null;
    try {
      const filter = 'se = "' + seId + '" && customer_name = "' + customerName.replace(/"/g, '\\"') + '" && product = "' + product.replace(/"/g, '\\"') + '"';
      console.log("[Create POC] Searching with filter:", filter);
      const records = e.app.findRecordsByFilter("pocs", filter, "-created", 1);
      if (records && records.length > 0) {
        existingPoc = records[0];
      }
    } catch (err) {
      console.log("[Create POC] No existing POC found (or error):", err);
    }

    if (existingPoc) {
      console.log("[Create POC] POC already exists:", existingPoc.getString("poc_uid"));

      // Update optional fields if provided
      let updated = false;
      if (partner) {
        existingPoc.set("partner", partner);
        updated = true;
      }
      if (aeb) {
        existingPoc.set("aeb", aeb);
        updated = true;
      }
      if (pocStartDate) {
        existingPoc.set("poc_start_date", pocStartDate);
        updated = true;
      }
      if (pocEndDate) {
        existingPoc.set("poc_end_date_plan", pocEndDate);
        updated = true;
      }

      if (updated) {
        e.app.save(existingPoc);
        console.log("[Create POC] Updated existing POC");
      }

      return e.json(200, {
        status: "ok",
        poc_uid: existingPoc.getString("poc_uid"),
        poc_id: existingPoc.id,
        is_new: false,
        message: "POC already exists"
      });
    }

    // Create new POC
    console.log("[Create POC] Creating new POC");

    const pocCollection = e.app.findCollectionByNameOrId("pocs");
    const newPoc = new Record(pocCollection);

    // Generate unique POC UID
    const randomHex = $security.randomString(12);
    const pocUid = "POC-" + randomHex.toUpperCase();
    const pocName = customerName + " - " + product;

    newPoc.set("poc_uid", pocUid);
    newPoc.set("name", pocName);
    newPoc.set("customer_name", customerName);
    newPoc.set("product", product);
    newPoc.set("se", seId);
    newPoc.set("is_active", true);
    newPoc.set("is_completed", false);
    newPoc.set("risk_status", "on_track");
    newPoc.set("last_daily_update_at", new Date().toISOString());

    if (partner) {
      newPoc.set("partner", partner);
    }
    if (aeb) {
      newPoc.set("aeb", aeb);
    }
    if (pocStartDate) {
      newPoc.set("poc_start_date", pocStartDate);
    }
    if (pocEndDate) {
      newPoc.set("poc_end_date_plan", pocEndDate);
    }

    e.app.save(newPoc);

    console.log("[Create POC] POC created successfully:", pocUid);

    const response = {
      status: "ok",
      poc_uid: pocUid,
      poc_id: newPoc.id,
      is_new: true,
      message: "POC created successfully"
    };

    if (userCreated) {
      response.user_created = true;
      response.user_email = seEmail;
      response.user_message = "A new user was created for " + seEmail + ". A password reset email has been sent.";
    }

    return e.json(201, response);

  } catch (error) {
    console.error("[Create POC] Error:", error);
    return e.json(500, { error: String(error) });
  }
});

console.log("[Create POC Hook 1.1] Route registered: POST /api/pocs/create");
