// pb_hooks/productboard_feature.pb.js
console.log("[ProductBoard 0.0.13] Feature hook loading...");

routerAdd("GET", "/api/productboard/features/{featureId}", (e) => {
  console.log("[ProductBoard] Get feature called");

  // --- Helpers live INSIDE the handler, so they are always in scope ---

  function extractIdFromSelfLink(selfUrl) {
    if (!selfUrl || typeof selfUrl !== "string") return "";
    const parts = selfUrl.split("/");
    return parts[parts.length - 1] || "";
  }

  /**
   * Walk component -> (component ...)* -> product
   */
  function resolveProductViaComponentRef(componentRef, callProductBoard, depth) {
    depth = depth || 0;
    if (!componentRef || depth > 8) {
      console.log("[ProductBoard] resolveProductViaComponentRef: depth limit or no componentRef");
      return { productId: "", productName: "" };
    }

    let componentId = componentRef.id || "";
    if (!componentId && componentRef.links && componentRef.links.self) {
      componentId = extractIdFromSelfLink(componentRef.links.self);
    }

    if (!componentId) {
      return { productId: "", productName: "" };
    }

    const compResp = callProductBoard("/components/" + componentId, "GET");
    console.log("[ProductBoard] /components status:", compResp.statusCode);

    if (compResp.statusCode !== 200) {
      console.error("[ProductBoard] Component lookup error:", compResp.statusCode, compResp.raw);
      return { productId: "", productName: "" };
    }

    const compJson = JSON.parse(compResp.raw || "{}");
    const c = compJson.data || compJson || {};
    const parent = c.parent || {};

    // A) component's parent is a product
    if (parent.product) {
      let productId = parent.product.id || "";
      if (!productId && parent.product.links && parent.product.links.self) {
        productId = extractIdFromSelfLink(parent.product.links.self);
      }

      if (!productId) return { productId: "", productName: "" };

      const prodResp = callProductBoard("/products/" + productId, "GET");
      console.log("[ProductBoard] /products (via component) status:", prodResp.statusCode);

      if (prodResp.statusCode === 200) {
        const prodJson = JSON.parse(prodResp.raw || "{}");
        const p = prodJson.data || prodJson || {};
        return {
          productId: productId,
          productName: p.name || "",
        };
      } else {
        console.error("[ProductBoard] Product lookup (from component) error:", prodResp.statusCode, prodResp.raw);
        return { productId: productId, productName: "" };
      }
    }

    // B) component's parent is another component => recurse
    if (parent.component) {
      return resolveProductViaComponentRef(parent.component, callProductBoard, depth + 1);
    }

    // No product found up this chain
    return { productId: "", productName: "" };
  }

  /**
   * Resolve product for any feature-like entity (feature or subfeature)
   * parent can be:
   *  - { product: ... }
   *  - { component: ... }
   *  - { feature: ... }  (subfeature → feature)
   */
  function resolveProductForFeatureEntity(entity, callProductBoard, depth) {
    depth = depth || 0;
    if (!entity || depth > 8) {
      console.log("[ProductBoard] resolveProductForFeatureEntity: depth limit or no entity");
      return { productId: "", productName: "" };
    }

    const parent = entity.parent || {};

    // 1) Direct parent.product (feature → product)
    if (parent.product) {
      let productId = parent.product.id || "";
      if (!productId && parent.product.links && parent.product.links.self) {
        productId = extractIdFromSelfLink(parent.product.links.self);
      }

      if (!productId) {
        return { productId: "", productName: "" };
      }

      const prodResp = callProductBoard("/products/" + productId, "GET");
      console.log("[ProductBoard] /products (direct) status:", prodResp.statusCode);

      if (prodResp.statusCode === 200) {
        const prodJson = JSON.parse(prodResp.raw || "{}");
        const p = prodJson.data || prodJson || {};
        return {
          productId: productId,
          productName: p.name || "",
        };
      } else {
        console.error("[ProductBoard] Product lookup error:", prodResp.statusCode, prodResp.raw);
        return { productId: productId, productName: "" };
      }
    }

    // 2) Parent.component (feature → component → ... → product)
    if (parent.component) {
      return resolveProductViaComponentRef(parent.component, callProductBoard, depth + 1);
    }

    // 3) Parent.feature (subfeature → feature → ...)
    if (parent.feature) {
      let featId = parent.feature.id || "";
      if (!featId && parent.feature.links && parent.feature.links.self) {
        featId = extractIdFromSelfLink(parent.feature.links.self);
      }

      if (!featId) {
        return { productId: "", productName: "" };
      }

      const featResp = callProductBoard("/features/" + featId, "GET");
      console.log("[ProductBoard] /features (parent feature) status:", featResp.statusCode);

      if (featResp.statusCode === 200) {
        const featJson = JSON.parse(featResp.raw || "{}");
        const f = featJson.data || featJson || {};
        return resolveProductForFeatureEntity(f, callProductBoard, depth + 1);
      } else {
        console.error("[ProductBoard] Parent feature lookup error:", featResp.statusCode, featResp.raw);
        return { productId: "", productName: "" };
      }
    }

    // No usable parent
    return { productId: "", productName: "" };
  }

  // --------- Main handler logic ---------
  try {
    const { callProductBoard } = require(__hooks + "/productboard_client.js");

    const featureId = e.request.pathValue("featureId");
    console.log("[ProductBoard] FeatureId:", featureId);

    const featureResp = callProductBoard("/features/" + featureId, "GET");
    console.log("[ProductBoard] /features status:", featureResp.statusCode);

    if (featureResp.statusCode !== 200) {
      console.error("[ProductBoard] Get feature API error:", featureResp.statusCode, featureResp.raw);
      return e.json(500, { error: "API error", status: featureResp.statusCode, raw: featureResp.raw });
    }

    const featureJson = JSON.parse(featureResp.raw || "{}");
    const f = featureJson.data || featureJson || {};

    console.log("[ProductBoard] Feature parent:", JSON.stringify(f.parent || {}, null, 2));

    // resolve product
    const resolved = resolveProductForFeatureEntity(f, callProductBoard, 0);
    const productId = resolved.productId || "";
    const productName = resolved.productName || "";

    // best-effort component id (for debugging)
    let componentId = "";
    if (f.parent && f.parent.component) {
      componentId = f.parent.component.id || "";
      if (!componentId && f.parent.component.links && f.parent.component.links.self) {
        componentId = extractIdFromSelfLink(f.parent.component.links.self);
      }
    }

    return e.json(200, {
      id: f.id || "",
      title: f.name || "",
      description: f.description || "",
      type: f.type || "",
      status: (f.status && f.status.name) ? f.status.name : "unknown",
      url: (f.links && f.links.html) ? f.links.html : "",
      product: productName,
      productId: productId,
      componentId: componentId,
      owner: (f.owner && f.owner.email) ? f.owner.email : "",
      release: (f.release && f.release.name) ? f.release.name : "",
      releaseDate: (f.release && f.release.released_at) ? f.release.released_at : null,
      timeframe: f.timeframe || null,
      updatedAt: f.updatedAt || null,
    });
  } catch (error) {
    console.error("[ProductBoard] Get feature error:", error);
    return e.json(500, { error: String(error) });
  }
});



console.log("[ProductBoard 0.0.13] Feature routes registered");
