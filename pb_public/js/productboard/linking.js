// productboard/linking.js
// Link features to POCs

import { appState } from '../state.js';
import { syncFeatureToLocal, getExistingLinks, deleteLink, displayCustomerImpact } from './api.js';

/**
 * Link feature to POC
 * @param {Object} params - All linking parameters
 * @returns {Promise<Object>} Created link
 */
export async function linkFeatureToPoc({
  feature,
  pocId,
  useCaseId = null,
  insightText,
  importance,
  neededByDate,
  customerImpact,
  seNotes,
  insightId
}) {
  try {
    // Sync feature to local database
    const featureRecord = await syncFeatureToLocal(appState.pb, feature);
    
    // Create link in poc_feature_requests
    const linkData = {
      poc: pocId,
      feature_request: featureRecord.id,
      needed_by_date: neededByDate || '',
      customer_impact: customerImpact,
      se_comment: seNotes || '',
      customer_comment: insightText,
      productboard_insight_id: insightId || '',
      created_by: appState.currentUser.id,
      created_at: new Date().toISOString()
    };
    
    if (useCaseId) {
      linkData.use_case = useCaseId;
    }
    
    const link = await appState.pb.collection('poc_feature_requests').create(linkData);
    
    console.log('[ProductBoard Linking] Feature linked:', link.id);
    
    return link;
    
  } catch (error) {
    console.error('[ProductBoard Linking] Link error:', error);
    throw error;
  }
}

/**
 * Unlink feature from POC
 * @param {string} linkId - Link ID to remove
 */
export async function unlinkFeature(linkId) {
  try {
    await deleteLink(appState.pb, linkId);
    console.log('[ProductBoard Linking] Feature unlinked:', linkId);
  } catch (error) {
    console.error('[ProductBoard Linking] Unlink error:', error);
    throw error;
  }
}

/**
 * Load existing links and render them
 * @param {HTMLElement} container - Container element
 * @param {string} pocId - POC ID
 * @param {string} useCaseId - Use case ID (optional)
 * @param {Function} onUpdate - Callback after update
 */
export async function loadAndRenderLinks(container, pocId, useCaseId, onUpdate) {
  const linksContainer = container.querySelector('.pb-links-list');
  
  if (!linksContainer) {
    console.error('[ProductBoard Linking] Links container not found');
    return;
  }
  
  linksContainer.innerHTML = '<div class="pb-loading">Loading links...</div>';
  
  try {
    const links = await getExistingLinks(appState.pb, pocId, useCaseId);
    
    if (links.length === 0) {
      linksContainer.innerHTML = '<div class="pb-no-links">No ProductBoard items linked yet</div>';
      return;
    }
    
    renderLinks(links, linksContainer, onUpdate);
    
  } catch (error) {
    console.error('[ProductBoard Linking] Load links error:', error);
    linksContainer.innerHTML = '<div class="pb-error">Failed to load links</div>';
  }
}

/**
 * Render links
 */
function renderLinks(links, container, onUpdate) {
  const html = links.map(link => {
    const feature = link.expand?.feature_request;
    if (!feature) return '';
    
    return `
      <div class="pb-link-item" data-link-id="${link.id}">
        <div class="pb-link-info">
          <div class="pb-link-title">${escapeHtml(feature.title)}</div>
          <div class="pb-link-meta">
            <span class="pb-badge pb-status-${normalizeStatus(feature.status)}">
              ${feature.status}
            </span>
            ${feature.product ? `<span class="pb-product-tag">${escapeHtml(feature.product)}</span>` : ''}
            ${link.customer_impact ? `
              <span class="pb-impact-badge pb-impact-${link.customer_impact}">
                ${displayCustomerImpact(link.customer_impact)}
              </span>
            ` : ''}
            ${link.needed_by_date ? `
              <span class="pb-date-tag">Needs by: ${formatDate(link.needed_by_date)}</span>
            ` : ''}
          </div>
          ${link.productboard_insight_id ? `
            <div class="pb-insight-badge" title="Insight sent to ProductBoard">
              📝 Insight Created
            </div>
          ` : ''}
        </div>
        <button type="button" class="pb-btn-remove" data-link-id="${link.id}" title="Remove link">
          🗑️
        </button>
      </div>
    `;
  }).filter(Boolean).join('');
  
  container.innerHTML = html;
  
  // Add remove handlers
  container.querySelectorAll('.pb-btn-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const linkId = e.target.dataset.linkId;
      
      if (!confirm('Remove this feature link?')) {
        return;
      }
      
      try {
        await unlinkFeature(linkId);
        
        // Reload links
        if (onUpdate) {
          onUpdate();
        }
      } catch (error) {
        alert('Failed to remove link: ' + error.message);
      }
    });
  });
}

/**
 * Utility functions
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function normalizeStatus(status) {
  return (status || '').toLowerCase().replace(/\s+/g, '-');
}

function capitalizeFirst(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch {
    return dateStr;
  }
}