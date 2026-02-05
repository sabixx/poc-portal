// productboard/suggestions.js
// Hot ERs and Recent Features Display

/**
 * Load and render Hot ERs (most linked features by SEs)
 */
export async function loadAndRenderHotERs(pb, pocId, container, onFeatureClick) {
  console.log('[ProductBoard Suggestions] Loading hot ERs...');
  
  try {
    // Get all poc_feature_requests (most linked features)
    const records = await pb.collection('poc_feature_requests').getList(1, 100, {
      expand: 'feature_request,poc,use_case',
      sort: '-created_at',
      $autoCancel: false
    });
    
    // Group by feature_request and count
    const featureCounts = {};
    records.items.forEach(item => {
      if (item.expand?.feature_request) {
        const featureId = item.feature_request;
        if (!featureCounts[featureId]) {
          featureCounts[featureId] = {
            feature: item.expand.feature_request,
            count: 0,
            latestDate: item.created
          };
        }
        featureCounts[featureId].count++;
        if (item.created > featureCounts[featureId].latestDate) {
          featureCounts[featureId].latestDate = item.created;
        }
      }
    });
    
    // Sort by count (most popular first)
    const hotERs = Object.values(featureCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    if (hotERs.length === 0) {
      container.innerHTML = '<div class="pb-no-results">No hot ERs yet</div>';
      return;
    }
    
    // Render hot ERs
    container.innerHTML = hotERs.map(item => 
      renderFeatureItem(item.feature, {
        showLinkCount: true,
        linkCount: item.count,
        onFeatureClick,
        pocId
      })
    ).join('');
    
    console.log('[ProductBoard Suggestions] Loaded', hotERs.length, 'hot ERs');
  } catch (error) {
    console.error('[ProductBoard Suggestions] Load hot ERs error:', error);
    container.innerHTML = '<div class="pb-error">Failed to load hot ERs</div>';
  }
}

/**
 * Load and render recent ProductBoard features
 */
export async function loadAndRenderRecentFeatures(container, onFeatureClick) {
  console.log('[ProductBoard Suggestions] Loading recent features...');
  
  try {
    const response = await fetch('/api/productboard/recent?limit=5');
    
    if (!response.ok) {
      throw new Error('Failed to fetch recent features');
    }
    
    const data = await response.json();
    const features = data.data || [];
    
    if (features.length === 0) {
      container.innerHTML = '<div class="pb-no-results">No recent features</div>';
      return;
    }
    
    // Fetch full details for each feature to get descriptions
    const detailedFeatures = await Promise.all(
      features.map(async (feature) => {
        try {
          const detailResponse = await fetch(`/api/productboard/features/${feature.id}`);
          if (detailResponse.ok) {
            return await detailResponse.json();
          }
        } catch (error) {
          console.warn('[ProductBoard] Failed to fetch details for', feature.id);
        }
        return feature; // Fallback to basic info
      })
    );
    
    container.innerHTML = detailedFeatures.map(feature => 
      renderFeatureItem(feature, { onFeatureClick })
    ).join('');
    
    console.log('[ProductBoard Suggestions] Loaded', features.length, 'recent features with details');
  } catch (error) {
    console.error('[ProductBoard Suggestions] Load recent features error:', error);
    container.innerHTML = '<div class="pb-error">Failed to load recent features</div>';
  }
}

/**
 * Render a feature item
 */
function renderFeatureItem(feature, options = {}) {
  const { showLinkCount, linkCount, onFeatureClick } = options;
  
  // Use external_id if available (from local DB), otherwise use id (from ProductBoard API)
  const featureId = feature.external_id || feature.id;
  const featureTitle = feature.title || feature.name || 'Untitled';
  const featureStatus = feature.status || 'unknown';
  const featureProduct = feature.product || '';
  
  // Truncate description to 200 chars
  const description = feature.description || '';
  const shortDesc = description.length > 200 
    ? description.substring(0, 200) + '...' 
    : description;
  
  // Strip HTML tags
  const stripHTML = (html) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };
  
  const cleanDesc = stripHTML(shortDesc);
  const hasMore = description.length > 200;
  const fullDesc = stripHTML(description);
  
  return `
    <div class="pb-feature-item" data-feature-id="${featureId}">
      <div class="pb-feature-info">
        <div class="pb-feature-title">${escapeHtml(featureTitle)}</div>
        ${cleanDesc ? `
          <div class="pb-feature-description" data-expanded="false">
            <span class="pb-desc-short">${escapeHtml(cleanDesc)}</span>
            ${hasMore ? `
              <button class="pb-expand-btn" type="button" data-action="toggle-desc">
                Show more
              </button>
              <span class="pb-desc-full" style="display:none;">${escapeHtml(fullDesc)}</span>
            ` : ''}
          </div>
        ` : ''}
        <div class="pb-feature-meta">
          <span class="pb-badge pb-status-${normalizeStatus(featureStatus)}">${featureStatus}</span>
          <span class="pb-product-tag">${featureProduct || '(no product)'}</span>
          ${showLinkCount ? `<span class="pb-link-count"><i data-lucide="link" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i> ${linkCount} link${linkCount !== 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>
      <button 
        class="pb-btn-link" 
        type="button"
        data-action="link"
        data-feature-id="${featureId}"
        data-feature-title="${escapeHtml(featureTitle)}"
      >
        Link
      </button>
    </div>
  `;
}

/**
 * Normalize status for CSS class
 */
function normalizeStatus(status) {
  return (status || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}