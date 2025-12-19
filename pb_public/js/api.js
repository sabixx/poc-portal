// PocketBase API helpers (no DOM here)

export function initPocketBase(baseUrl) {
  if (!window.PocketBase) {
    console.error(
      "[POC-PORTAL] PocketBase SDK not found. " +
        "Make sure the <script src=\"https://unpkg.com/pocketbase/dist/pocketbase.umd.js\"></script> loads."
    );
    return null;
  }
  return new window.PocketBase(baseUrl);
}

export async function loginUser(pb, email, password) {
  await pb.collection("users").authWithPassword(email, password);
  return pb.authStore.model;
}

/**
 * Load all relevant data.
 * NOTE: Everyone gets ALL POCs - filtering is handled by the frontend filters.
 * Default filter selection is role-based (SE sees own POCs, Manager sees mapped SEs).
 *
 * Returns:
 *  - users: all visible users
 *  - pocs:  ALL pocs (unfiltered)
 *  - puc:   all poc_use_cases
 *  - roleText: text for the UI hint
 */
export async function fetchAllData(pb, currentUser) {
  console.log("[POC-PORTAL] Fetching data …");

  // users
  const users = await pb.collection("users").getFullList({
    sort: "email",
  });

  // pocs - everyone gets ALL POCs (frontend filters handle display)
  const pocs = await pb.collection("pocs").getFullList({
    expand: "se",
    sort: "customer_name",
  });

  let roleText = "";

  if (currentUser.role === "se") {
    roleText = "Role: SE – your POCs are shown by default (use filters to see others).";
  } else if (currentUser.role === "ae") {
    roleText = "Role: AE – your mapped SEs' POCs are shown by default.";
  } else if (currentUser.role === "manager") {
    roleText = "Role: Manager – your team's POCs are shown by default.";
  } else {
    roleText = `Role: ${currentUser.role || "unknown"}`;
  }

  const puc = await pb.collection("poc_use_cases").getFullList({
    expand: "use_case,poc",
  });

  console.log(
    "[POC-PORTAL] Loaded",
    users.length,
    "users,",
    pocs.length,
    "pocs,",
    puc.length,
    "poc_use_cases"
  );

  return { users, pocs, puc, roleText };
}

/**
 * Batch fetch ALL comments at once (instead of per-POC)
 * This dramatically improves performance
 */
export async function fetchAllComments(pb) {
  console.log("[POC-PORTAL] Fetching all comments...");
  try {
    const comments = await pb.collection("comments").getFullList({
      sort: "-created",
      $autoCancel: false
    });
    console.log("[POC-PORTAL] Loaded", comments.length, "comments total");
    return comments;
  } catch (error) {
    console.error("[POC-PORTAL] Failed to fetch comments:", error);
    return [];
  }
}

/**
 * Fetch ALL feature requests by fetching per-POC (which works reliably)
 * @param {Object} pb - PocketBase instance
 * @param {Array} pocs - Array of POC objects (optional, will fetch for all if provided)
 */
export async function fetchAllFeatureRequests(pb, pocs = []) {
  console.log("[POC-PORTAL] Fetching all feature requests...");

  // First, try the simplest possible query to test collection access
  console.log("[POC-PORTAL] Testing basic collection access...");
  try {
    const testResult = await pb.collection("poc_feature_requests").getList(1, 1, {
      $autoCancel: false
    });
    console.log("[POC-PORTAL] Basic access OK - collection has", testResult.totalItems, "total records");
  } catch (testError) {
    console.error("[POC-PORTAL] Basic collection access FAILED:", testError.message);
    console.error("[POC-PORTAL] This suggests a permission or collection configuration issue");
    console.error("[POC-PORTAL] Error status:", testError.status, "data:", JSON.stringify(testError.data));

    // Return empty - can't access the collection at all
    return [];
  }

  // If we have POCs, fetch per-POC SEQUENTIALLY
  if (pocs && pocs.length > 0) {
    console.log("[POC-PORTAL] Using sequential per-POC fetch for", pocs.length, "POCs...");

    const allRecords = [];
    let pocsWithERs = 0;
    let failCount = 0;

    for (const poc of pocs) {
      try {
        // Use getList with minimal options
        const result = await pb.collection("poc_feature_requests").getList(1, 100, {
          filter: `poc = "${poc.id}"`,
          $autoCancel: false
        });

        if (result.items.length > 0) {
          pocsWithERs++;
          // Expand each one individually
          for (const fr of result.items) {
            try {
              const expanded = await pb.collection("poc_feature_requests").getOne(fr.id, {
                expand: "feature_request,use_case",
                $autoCancel: false
              });
              allRecords.push(expanded);
            } catch (expErr) {
              console.warn("[POC-PORTAL] Could not expand FR", fr.id);
              allRecords.push(fr);
            }
          }
        }
      } catch (error) {
        failCount++;
        if (failCount <= 3) {
          console.warn("[POC-PORTAL] Failed for POC", poc.id, ":", error.message);
        }
      }
    }

    if (failCount > 3) {
      console.warn("[POC-PORTAL] ... and", failCount - 3, "more failures");
    }

    console.log("[POC-PORTAL] Loaded", allRecords.length, "feature requests from", pocsWithERs, "POCs (", failCount, "failures)");
    return allRecords;
  }

  return [];
}

// productboard/api.js
// ProductBoard API Client

/**
 * Search ProductBoard features
 * @param {string} query - Search query
 * @param {string} product - Product filter (optional)
 * @returns {Promise<Array>}
 */
export async function searchFeatures(query, product = '') {
  try {
    let url = `/api/productboard/search?query=${encodeURIComponent(query)}`;
    if (product) {
      url += `&product=${encodeURIComponent(product)}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('[ProductBoard API] Search error:', error);
    throw error;
  }
}

/**
 * Get recent/hot features
 * @param {number} limit - Number of features to return
 * @returns {Promise<Array>}
 */
export async function getRecentFeatures(limit = 5) {
  try {
    const response = await fetch(`/api/productboard/recent?limit=${limit}`);
    
    if (!response.ok) {
      throw new Error(`Get recent failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('[ProductBoard API] Get recent error:', error);
    throw error;
  }
}

/**
 * Get feature details by ID
 * @param {string} featureId - ProductBoard feature ID
 * @returns {Promise<Object>}
 */
export async function getFeature(featureId) {
  try {
    const response = await fetch(`/api/productboard/features/${featureId}`);
    
    if (!response.ok) {
      throw new Error(`Get feature failed: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[ProductBoard API] Get feature error:', error);
    throw error;
  }
}

/**
 * Get list of products
 * @returns {Promise<Array<string>>}
 */
export async function getProducts() {
  try {
    const response = await fetch('/api/productboard/products');
    
    if (!response.ok) {
      throw new Error(`Get products failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('[ProductBoard API] Get products error:', error);
    throw error;
  }
}

/**
 * Create insight in ProductBoard
 * @param {Object} params - Insight parameters
 * @returns {Promise<Object>}
 */
export async function createInsight({
  featureId,
  insightText,
  importance = 'critical',
  customerName = '',
  pocName = '',
  useCaseName = '',
  userName = ''
}) {
  try {
    const response = await fetch('/api/productboard/insights', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        featureId,
        insightText,
        importance,
        customerName,
        pocName,
        useCaseName,
        userName
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create insight');
    }
    
    return await response.json();
  } catch (error) {
    console.error('[ProductBoard API] Create insight error:', error);
    throw error;
  }
}

/**
 * Sync ProductBoard feature to local database
 * @param {Object} pb - PocketBase instance
 * @param {Object} feature - ProductBoard feature
 * @returns {Promise<Object>} - Local feature_request record
 */
export async function syncFeatureToLocal(pb, feature) {
  try {
    // Check if feature already exists
    const existing = await pb.collection('feature_requests').getList(1, 1, {
      filter: `source = "productboard" && external_id = "${feature.id}"`
    });
    
    const featureData = {
      source: 'productboard',
      external_id: feature.id,
      external_url: feature.url,
      title: feature.title,
      description: feature.description || '',
      status: mapStatus(feature.status),
      product: feature.product || '',
      last_synced_at: new Date().toISOString()
    };
    
    if (existing.totalItems > 0) {
      // Update existing
      return await pb.collection('feature_requests').update(existing.items[0].id, featureData);
    } else {
      // Create new
      return await pb.collection('feature_requests').create(featureData);
    }
  } catch (error) {
    console.error('[ProductBoard API] Sync feature error:', error);
    throw error;
  }
}

/**
 * Map ProductBoard status to internal status
 */
function mapStatus(pbStatus) {
  if (!pbStatus) return 'under_consideration';
  
  const status = pbStatus.toLowerCase();
  
  if (status.includes('release') || status.includes('ship') || status.includes('done')) {
    return 'released';
  }
  if (status.includes('develop') || status.includes('progress')) {
    return 'in_development';
  }
  if (status.includes('plan')) {
    return 'planned';
  }
  if (status.includes('archive')) {
    return 'archived';
  }
  
  return 'under_consideration';
}

/**
 * Get existing links for POC/use case
 * @param {Object} pb - PocketBase instance
 * @param {string} pocId - POC ID
 * @param {string} useCaseId - Use case ID (optional)
 * @returns {Promise<Array>}
 */
export async function getExistingLinks(pb, pocId, useCaseId = null) {
  try {
    let filter = `poc = "${pocId}"`;
    if (useCaseId) {
      filter += ` && use_case = "${useCaseId}"`;
    }
    
    const links = await pb.collection('poc_feature_requests').getFullList({
      filter,
      expand: 'feature_request',
      sort: '-created_at',
      $autoCancel: false  // Prevent auto-cancellation
    });
    
    return links;
  } catch (error) {
    console.error('[ProductBoard API] Get existing links error:', error);
    // Return empty array instead of throwing if it's just auto-cancel
    if (error.isAbort) {
      return [];
    }
    throw error;
  }
}

/**
 * Delete link
 * @param {Object} pb - PocketBase instance
 * @param {string} linkId - Link ID to delete
 */
export async function deleteLink(pb, linkId) {
  try {
    await pb.collection('poc_feature_requests').delete(linkId);
  } catch (error) {
    console.error('[ProductBoard API] Delete link error:', error);
    throw error;
  }
}