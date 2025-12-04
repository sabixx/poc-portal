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
      filter: `source = "productboard" && external_id = "${feature.id}"`,
      $autoCancel: false
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
  console.log('[ProductBoard API] getExistingLinks called with:', { pocId, useCaseId });
  
  try {
    // Try simplest query first - no expand, no filter
    console.log('[ProductBoard API] Fetching all poc_feature_requests...');
    
    const allLinks = await pb.collection('poc_feature_requests').getFullList({
      sort: '-created_at'
      // NO expand, NO filter - absolutely minimal query
    });
    
    console.log('[ProductBoard API] Fetched', allLinks.length, 'total links');
    
    // Filter in JavaScript
    let filtered = allLinks.filter(link => link.poc === pocId);
    
    if (useCaseId) {
      filtered = filtered.filter(link => link.use_case === useCaseId);
    }
    
    console.log('[ProductBoard API] Filtered to', filtered.length, 'links for this POC/UC');
    
    // Now manually expand each one
    const expandedLinks = [];
    for (const link of filtered) {
      try {
        const expanded = await pb.collection('poc_feature_requests').getOne(link.id, {
          expand: 'feature_request,use_case'
        });
        expandedLinks.push(expanded);
      } catch (error) {
        console.warn('[ProductBoard API] Could not expand link:', link.id, error);
        expandedLinks.push(link); // Use unexpanded
      }
    }
    
    console.log('[ProductBoard API] Returning', expandedLinks.length, 'expanded links');
    return expandedLinks;
  } catch (error) {
    console.error('[ProductBoard API] Get existing links error:', error);
    console.error('[ProductBoard API] Error details:', error.data);
    return []; // Return empty array to allow modal to continue
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

/**
 * Create a link between a POC (and optional use case) and a feature_request
 * @param {Object} pb - PocketBase instance
 * @param {string} pocId - POC ID
 * @param {string} featureRequestId - Feature request ID (can be ProductBoard external_id)
 * @param {string} useCaseId - Use case ID (optional)
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Created poc_feature_requests record
 */
export async function createLink(pb, pocId, featureRequestId, useCaseId = null, options = {}) {
  try {
    console.log('[ProductBoard API] createLink called with:', { pocId, featureRequestId, useCaseId, options });
    
    // If featureRequestId looks like a ProductBoard ID, find or create the feature_request
    let actualFeatureRequestId = featureRequestId;
    
    if (featureRequestId.includes('-')) {
      console.log('[ProductBoard API] Detected ProductBoard external_id, syncing to local DB...');
      
      // This is a ProductBoard external_id, need to sync it first
      const existing = await pb.collection('feature_requests').getList(1, 1, {
        filter: `source = "productboard" && external_id = "${featureRequestId}"`,
        $autoCancel: false
      });
      
      if (existing.items.length > 0) {
        actualFeatureRequestId = existing.items[0].id;
        console.log('[ProductBoard API] Found existing feature_request:', actualFeatureRequestId);
      } else {
        console.log('[ProductBoard API] Feature not found locally, fetching from ProductBoard...');
        
        // Fetch from ProductBoard and create
        const pbFeature = await getFeature(featureRequestId);
        console.log('[ProductBoard API] Fetched ProductBoard feature:', pbFeature.title);
        
        const newFeature = await syncFeatureToLocal(pb, pbFeature);
        actualFeatureRequestId = newFeature.id;
        console.log('[ProductBoard API] Created local feature_request:', actualFeatureRequestId);
      }
    }
    
    // Get current user ID from auth store
    const currentUserId = options.currentUserId || pb.authStore?.model?.id || '';
    
    const linkData = {
      poc: pocId,
      feature_request: actualFeatureRequestId,
      needed_by_date: options.neededByDate || '',
      se_comment: options.seComment || '',
      customer_impact: options.customerImpact || 'medium',
      created_by: currentUserId,
    };

    if (useCaseId) {
      linkData.use_case = useCaseId;
      console.log('[ProductBoard API] Including use_case in link:', useCaseId);
    }
    
    console.log('[ProductBoard API] Creating link with data:', linkData);

    const result = await pb.collection('poc_feature_requests').create(linkData);
    console.log('[ProductBoard API] Link created successfully:', result.id);
    return result;
  } catch (error) {
    console.error('[ProductBoard API] Create link error:', error);
    console.error('[ProductBoard API] Error response:', error.response);
    console.error('[ProductBoard API] Error data:', error.data);
    console.error('[ProductBoard API] Error status:', error.status);
    
    // Try to extract validation errors
    if (error.data && typeof error.data === 'object') {
      console.error('[ProductBoard API] Validation errors:');
      Object.keys(error.data).forEach(key => {
        if (key !== 'message' && key !== 'code') {
          console.error(`  - ${key}:`, JSON.stringify(error.data[key], null, 2));
        }
      });
    }
    
    throw error;
  }
}