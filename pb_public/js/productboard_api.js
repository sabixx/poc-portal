// productboard_api.js - Server Proxy Version (Secure)
// Calls YOUR server which then calls ProductBoard API
// Token stays on server, never exposed to browser

/**
 * Search ProductBoard features via server proxy
 * @param {string} query - Search query
 * @returns {Promise<Array>} Array of feature results
 */
export async function searchProductBoardFeatures(query) {
  console.log('[ProductBoard API] === SEARCH START ===');
  console.log('[ProductBoard API] Query:', query);
  console.log('[ProductBoard API] Query type:', typeof query);
  console.log('[ProductBoard API] Query length:', query?.length);
  
  try {
    const url = `/api/productboard/search?query=${encodeURIComponent(query)}`;
    console.log('[ProductBoard API] Full URL:', url);
    console.log('[ProductBoard API] Encoded query:', encodeURIComponent(query));
    
    console.log('[ProductBoard API] Fetching...');
    const response = await fetch(url);
    
    console.log('[ProductBoard API] Response received');
    console.log('[ProductBoard API] Response status:', response.status);
    console.log('[ProductBoard API] Response ok:', response.ok);
    console.log('[ProductBoard API] Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ProductBoard API] Error response body:', errorText);
      
      if (response.status === 401) {
        throw new Error('Authentication required');
      }
      if (response.status === 404) {
        throw new Error('Server endpoint not found - /api/productboard/search does not exist');
      }
      if (response.status === 500) {
        throw new Error('Server error - check server logs');
      }
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    console.log('[ProductBoard API] Parsing JSON...');
    const data = await response.json();
    console.log('[ProductBoard API] Parsed data:', data);
    console.log('[ProductBoard API] Data type:', typeof data);
    console.log('[ProductBoard API] Data keys:', Object.keys(data));
    
    const results = data.data || [];
    console.log('[ProductBoard API] Results array:', results);
    console.log('[ProductBoard API] Results length:', results.length);
    console.log('[ProductBoard API] Results type:', typeof results);
    console.log('[ProductBoard API] Is array?:', Array.isArray(results));
    
    if (results.length > 0) {
      console.log('[ProductBoard API] First result:', results[0]);
    }
    
    console.log('[ProductBoard API] === SEARCH END ===');
    return results;
    
  } catch (error) {
    console.error('[ProductBoard API] === SEARCH ERROR ===');
    console.error('[ProductBoard API] Error type:', error.constructor.name);
    console.error('[ProductBoard API] Error message:', error.message);
    console.error('[ProductBoard API] Error stack:', error.stack);
    throw error;
  }
}

/**
 * Get a specific ProductBoard feature by ID via server proxy
 * @param {string} featureId - ProductBoard feature ID
 * @returns {Promise<Object>} Feature details
 */
export async function getProductBoardFeature(featureId) {
  try {
    const response = await fetch(
      `/api/productboard/features/${featureId}`
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication required');
      }
      throw new Error(`Server error: ${response.status}`);
    }

    return await response.json();
    
  } catch (error) {
    console.error('[ProductBoard] Get feature error:', error);
    throw error;
  }
}

/**
 * Sync a ProductBoard feature to local database
 * @param {Object} pb - PocketBase instance
 * @param {string} featureId - ProductBoard feature ID
 * @returns {Promise<Object>} Created or updated feature_request record
 */
export async function syncProductBoardFeature(pb, featureId) {
  const feature = await getProductBoardFeature(featureId);
  
  // Check if feature already exists
  const existing = await pb.collection('feature_requests').getList(1, 1, {
    filter: `source = "productboard" && external_id = "${featureId}"`,
  });
  
  const featureData = {
    source: 'productboard',
    external_id: feature.id,
    external_url: feature.url,
    title: feature.title,
    description: feature.description || '',
    status: mapProductBoardStatus(feature.status),
    release_version: feature.release || '',
    release_date: feature.releaseDate || '',
    product: feature.product || '',
    priority: feature.priority,
    last_synced_at: new Date().toISOString(),
  };
  
  if (existing.totalItems > 0) {
    // Update existing
    return await pb.collection('feature_requests').update(existing.items[0].id, featureData);
  } else {
    // Create new
    return await pb.collection('feature_requests').create(featureData);
  }
}

/**
 * Map ProductBoard status to our internal status
 * @param {string} pbStatus - ProductBoard status name
 * @returns {string} Internal status
 */
function mapProductBoardStatus(pbStatus) {
  if (!pbStatus) return 'under_consideration';
  
  const status = pbStatus.toLowerCase();
  
  if (status.includes('consider') || status.includes('new')) {
    return 'under_consideration';
  }
  if (status.includes('plan')) {
    return 'planned';
  }
  if (status.includes('develop') || status.includes('progress')) {
    return 'in_development';
  }
  if (status.includes('release') || status.includes('ship') || status.includes('done')) {
    return 'released';
  }
  if (status.includes('archive')) {
    return 'archived';
  }
  
  return 'under_consideration';
}

/**
 * Link a feature request to a POC
 * @param {Object} pb - PocketBase instance
 * @param {Object} params - Link parameters
 * @returns {Promise<Object>} Created poc_feature_request record
 */
export async function linkFeatureToPoc(pb, {
  pocId,
  featureRequestId,
  useCaseId = null,
  neededByDate = null,
  seComment = '',
  customerImpact = 'medium',
  currentUserId,
}) {
  const linkData = {
    poc: pocId,
    feature_request: featureRequestId,
    needed_by_date: neededByDate || '',
    se_comment: seComment,
    customer_impact: customerImpact,
    created_by: currentUserId,
    created_at: new Date().toISOString(),
  };
  
  if (useCaseId) {
    linkData.use_case = useCaseId;
  }
  
  return await pb.collection('poc_feature_requests').create(linkData);
}

/**
 * Unlink a feature request from a POC
 * @param {Object} pb - PocketBase instance
 * @param {string} linkId - poc_feature_request record ID
 */
export async function unlinkFeatureFromPoc(pb, linkId) {
  return await pb.collection('poc_feature_requests').delete(linkId);
}

/**
 * Get all feature requests for a POC
 * @param {Object} pb - PocketBase instance
 * @param {string} pocId - POC ID
 * @returns {Promise<Array>} Array of feature request links
 */
export async function getPocFeatureRequests(pb, pocId) {
  return await pb.collection('poc_feature_requests').getFullList({
    filter: `poc = "${pocId}"`,
    expand: 'feature_request,use_case,created_by',
    sort: '-created_at',
  });
}

/**
 * Get all feature requests for a use case
 * @param {Object} pb - PocketBase instance
 * @param {string} useCaseId - Use case ID
 * @returns {Promise<Array>} Array of feature request links
 */
export async function getUseCaseFeatureRequests(pb, useCaseId) {
  return await pb.collection('poc_feature_requests').getFullList({
    filter: `use_case = "${useCaseId}"`,
    expand: 'feature_request,poc,created_by',
    sort: '-created_at',
  });
}

/**
 * Update feature request link details
 * @param {Object} pb - PocketBase instance
 * @param {string} linkId - poc_feature_request record ID
 * @param {Object} updates - Fields to update
 */
export async function updateFeatureRequestLink(pb, linkId, updates) {
  return await pb.collection('poc_feature_requests').update(linkId, updates);
}

/**
 * Batch sync multiple ProductBoard features
 * @param {Object} pb - PocketBase instance
 * @param {Array<string>} featureIds - Array of ProductBoard feature IDs
 * @returns {Promise<Array>} Array of synced feature_request records
 */
export async function batchSyncProductBoardFeatures(pb, featureIds) {
  const results = [];
  
  for (const featureId of featureIds) {
    try {
      const result = await syncProductBoardFeature(pb, featureId);
      results.push({ success: true, featureId, record: result });
    } catch (error) {
      console.error(`[ProductBoard] Failed to sync feature ${featureId}:`, error);
      results.push({ success: false, featureId, error: error.message });
    }
  }
  
  return results;
}

/**
 * Get status badge class for feature status
 * @param {string} status - Feature status
 * @returns {string} CSS class name
 */
export function getStatusBadgeClass(status) {
  switch (status) {
    case 'released':
      return 'fr-status-released';
    case 'in_development':
      return 'fr-status-in-dev';
    case 'planned':
      return 'fr-status-planned';
    case 'under_consideration':
      return 'fr-status-considering';
    case 'archived':
      return 'fr-status-archived';
    default:
      return 'fr-status-default';
  }
}

/**
 * Get status display label
 * @param {string} status - Feature status
 * @returns {string} Display label
 */
export function getStatusLabel(status) {
  switch (status) {
    case 'released':
      return 'Released';
    case 'in_development':
      return 'In Development';
    case 'planned':
      return 'Planned';
    case 'under_consideration':
      return 'Under Consideration';
    case 'archived':
      return 'Archived';
    default:
      return 'Unknown';
  }
}

/**
 * Get customer impact badge class
 * @param {string} impact - Customer impact level
 * @returns {string} CSS class name
 */
export function getImpactBadgeClass(impact) {
  switch (impact) {
    case 'blocker':
      return 'fr-impact-blocker';
    case 'high':
      return 'fr-impact-high';
    case 'medium':
      return 'fr-impact-medium';
    case 'low':
      return 'fr-impact-low';
    default:
      return 'fr-impact-default';
  }
}

/**
 * Display customer impact as user-friendly label
 * Maps PocketBase values to UI display names
 * @param {string} dbValue - PocketBase stored value
 * @returns {string} Display label
 */
export function displayCustomerImpact(dbValue) {
  const mapping = {
    'blocker': 'Critical',
    'high': 'Time Sensitive',
    'medium': 'Roadmap Candidate',
    'low': 'Nice To Have'
  };
  return mapping[dbValue] || dbValue;
}

/**
 * Format release date for display
 * @param {string} dateStr - ISO date string
 * @returns {string} Formatted date
 */
export function formatReleaseDate(dateStr) {
  if (!dateStr) return '–';
  
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '–';
  }
}