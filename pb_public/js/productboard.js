// productboard.js
// Main entry point for ProductBoard integration

// Export main modal function
export { showProductBoardLinkModal } from './productboard/modal.js';

// Re-export utilities if needed elsewhere
export { 
  searchFeatures, 
  getRecentFeatures, 
  createInsight 
} from './productboard/api.js';

export { 
  IMPORTANCE_LEVELS, 
  IMPACT_LEVELS 
} from './productboard/config.js';

/**
 * Render ProductBoard badges for POC cards
 * This is for backwards compatibility with existing code
 * @param {Array} links - Array of ProductBoard links
 * @returns {string} HTML for badges
 */
export function renderProductBoardBadges(links) {
  if (!links || links.length === 0) {
    return '';
  }
  
  // If links is from old format (array of objects)
  const badges = links.map(link => {
    const status = link.status || link.expand?.feature_request?.status || 'unknown';
    const title = link.feature_name || link.expand?.feature_request?.title || 'Feature';
    const statusClass = normalizeStatus(status);
    
    return `
      <span class="pb-badge pb-status-${statusClass}" title="${escapeHtml(title)}">
        <i data-lucide="clipboard-list" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i> ${status}
      </span>
    `;
  }).join('');
  
  return `<div class="pb-badges">${badges}</div>`;
}

/**
 * Get status badge HTML
 * @param {Object} link - Feature link object
 * @returns {string} HTML for single badge
 */
export function getStatusBadge(link) {
  const feature = link.expand?.feature_request;
  if (!feature) return '';
  
  const status = feature.status || 'unknown';
  const statusClass = normalizeStatus(status);
  
  return `<span class="pb-badge pb-status-${statusClass}">${status}</span>`;
}

/**
 * Normalize status for CSS class
 */
function normalizeStatus(status) {
  return (status || '').toLowerCase().replace(/\s+/g, '-');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}