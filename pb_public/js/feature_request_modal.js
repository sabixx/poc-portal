// feature_request_modal.js - UI for linking feature requests to POCs/Use Cases
import { appState } from "./state.js";
import {
  searchProductBoardFeatures,
  syncProductBoardFeature,
  linkFeatureToPoc,
  unlinkFeatureFromPoc,
  getPocFeatureRequests,
  getStatusBadgeClass,
  getStatusLabel,
  getImpactBadgeClass,
  displayCustomerImpact,
  formatReleaseDate,
} from "./productboard_api.js";

let currentModal = null;
let searchTimeout = null;

/**
 * Show feature request link modal
 * @param {Object} params
 * @param {string} params.pocId - POC ID (required)
 * @param {string} params.useCaseId - Use case ID (optional)
 * @param {string} params.useCaseName - Use case name for display (optional)
 */
export async function showFeatureRequestModal({ pocId, useCaseId = null, useCaseName = null }) {
  // Close any existing modal
  if (currentModal) {
    currentModal.remove();
  }

  const modal = document.createElement('div');
  modal.className = 'fr-modal-overlay';
  
  const title = useCaseName 
    ? `Link Feature Requests - ${useCaseName}`
    : 'Link Feature Requests to POC';

  modal.innerHTML = `
    <div class="fr-modal-content">
      <div class="fr-modal-header">
        <h3>${title}</h3>
        <button type="button" class="fr-modal-close">&times;</button>
      </div>
      
      <div class="fr-modal-body">
        <!-- Search Section -->
        <div class="fr-search-section">
          <label class="fr-label">Search Feature Requests</label>
          <div class="fr-search-input-wrapper">
            <input 
              type="text" 
              class="fr-search-input" 
              placeholder="Search ProductBoard features..."
            />
            <button type="button" class="fr-create-custom-btn" title="Create custom feature request">
              + Custom
            </button>
          </div>
          
          <div class="fr-search-results">
            <div class="fr-search-hint">Type to search ProductBoard...</div>
          </div>
        </div>
        
        <!-- Linked Features Section -->
        <div class="fr-linked-section">
          <h4>Linked Feature Requests</h4>
          <div class="fr-linked-list">
            <div class="fr-loading">Loading...</div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  currentModal = modal;

  // Event listeners
  const closeBtn = modal.querySelector('.fr-modal-close');
  const searchInput = modal.querySelector('.fr-search-input');
  const createCustomBtn = modal.querySelector('.fr-create-custom-btn');

  closeBtn.addEventListener('click', () => closeModal());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  searchInput.addEventListener('input', (e) => {
    handleSearch(e.target.value, pocId, useCaseId);
  });

  createCustomBtn.addEventListener('click', () => {
    showCustomFeatureForm(pocId, useCaseId);
  });

  // Load linked features
  await loadLinkedFeatures(pocId, useCaseId);
}

/**
 * Handle search input with debouncing
 */
function handleSearch(query, pocId, useCaseId) {
  const resultsContainer = currentModal.querySelector('.fr-search-results');
  
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (!query || query.trim().length < 2) {
    resultsContainer.innerHTML = '<div class="fr-search-hint">Type to search ProductBoard...</div>';
    return;
  }

  resultsContainer.innerHTML = '<div class="fr-loading">Searching...</div>';

  searchTimeout = setTimeout(async () => {
    try {
      console.log('[FeatureRequest] Searching for:', query);
      const results = await searchProductBoardFeatures(query);
      console.log('[FeatureRequest] Search results:', results);
      
      if (!results || results.length === 0) {
        resultsContainer.innerHTML = `
          <div class="fr-no-results">
            <p>No features found for "${query}"</p>
            <p style="font-size: 12px; color: var(--fg-muted); margin-top: 8px;">
              Try a different search term or click "+ Custom" to create a custom feature request.
            </p>
          </div>
        `;
        return;
      }
      
      renderSearchResults(results, pocId, useCaseId);
    } catch (error) {
      console.error('[FeatureRequest] Search error:', error);
      
      // Detailed error message
      let errorMessage = 'Search failed';
      if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      // Check if it's a config error
      if (error.message && error.message.includes('token not configured')) {
        resultsContainer.innerHTML = `
          <div class="fr-error">
            <strong>ProductBoard API Not Configured</strong>
            <p>Please configure your ProductBoard API token to search features.</p>
            <p style="margin-top: 12px;">You can still create custom feature requests using the "+ Custom" button.</p>
          </div>
        `;
      } else if (error.message && error.message.includes('401')) {
        resultsContainer.innerHTML = `
          <div class="fr-error">
            <strong>Authentication Error</strong>
            <p>Please make sure you're logged in and try again.</p>
          </div>
        `;
      } else if (error.message && error.message.includes('404')) {
        resultsContainer.innerHTML = `
          <div class="fr-error">
            <strong>Server Endpoint Not Found</strong>
            <p>The ProductBoard proxy endpoint is not configured on your server.</p>
            <p style="margin-top: 8px; font-size: 12px;">
              Server needs: <code>/api/productboard/search</code>
            </p>
            <p style="margin-top: 12px;">You can still use "+ Custom" to create feature requests.</p>
          </div>
        `;
      } else if (error.message && error.message.includes('500')) {
        resultsContainer.innerHTML = `
          <div class="fr-error">
            <strong>Server Error</strong>
            <p>The server encountered an error searching ProductBoard.</p>
            <p style="margin-top: 8px; font-size: 12px;">
              Check server logs for details.
            </p>
          </div>
        `;
      } else {
        resultsContainer.innerHTML = `
          <div class="fr-error">
            <strong>Search Failed</strong>
            <p>${errorMessage}</p>
            <p style="margin-top: 12px; font-size: 12px;">
              Check browser console for details.
            </p>
          </div>
        `;
      }
    }
  }, 300);
}

/**
 * Render search results
 */
function renderSearchResults(results, pocId, useCaseId) {
  const resultsContainer = currentModal.querySelector('.fr-search-results');
  
  if (results.length === 0) {
    resultsContainer.innerHTML = '<div class="fr-no-results">No features found</div>';
    return;
  }

  resultsContainer.innerHTML = results.map(feature => `
    <div class="fr-result-item" data-feature-id="${feature.id}">
      <div class="fr-result-info">
        <div class="fr-result-name">${feature.title}</div>
        <div class="fr-result-meta">
          <span class="fr-status-badge ${getStatusBadgeClass(feature.status)}">
            ${getStatusLabel(feature.status)}
          </span>
          ${feature.release ? `<span class="fr-release">📦 ${feature.release}</span>` : ''}
          ${feature.product ? `<span class="fr-product">🏷️ ${feature.product}</span>` : ''}
        </div>
      </div>
      <button type="button" class="fr-result-link-btn" data-feature='${JSON.stringify(feature)}'>
        Link
      </button>
    </div>
  `).join('');

  // Attach link button listeners
  resultsContainer.querySelectorAll('.fr-result-link-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const feature = JSON.parse(btn.dataset.feature);
      await handleLinkFeature(feature, pocId, useCaseId);
    });
  });
}

/**
 * Handle linking a feature to POC/Use Case
 */
async function handleLinkFeature(feature, pocId, useCaseId) {
  try {
    if (!appState.pb) {
      alert('Database connection not available');
      return;
    }

    // Show link details form
    showLinkDetailsForm(feature, pocId, useCaseId);

  } catch (error) {
    console.error('[FeatureRequest] Link error:', error);
    alert('Failed to link feature. Please try again.');
  }
}

/**
 * Show form to add link details
 */
function showLinkDetailsForm(feature, pocId, useCaseId, featureRequestId = null) {
  const formHtml = `
    <div class="fr-link-form-overlay">
      <div class="fr-link-form">
        <h4>Link Feature: ${feature.title}</h4>
        
        <div class="fr-form-field">
          <label class="fr-label">Customer needs this by:</label>
          <input type="date" class="fr-needed-by-date" />
        </div>
        
        <div class="fr-form-field">
          <label class="fr-label">Customer Impact:</label>
          <select class="fr-customer-impact">
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="high">High</option>
            <option value="blocker">Blocker</option>
          </select>
        </div>
        
        <div class="fr-form-field">
          <label class="fr-label">SE Comment:</label>
          <textarea class="fr-se-comment" rows="3" 
            placeholder="Notes about customer need, workarounds, priority..."></textarea>
        </div>
        
        <div class="fr-form-actions">
          <button type="button" class="fr-btn-cancel">Cancel</button>
          <button type="button" class="fr-btn-save">Link Feature</button>
        </div>
      </div>
    </div>
  `;

  const formContainer = document.createElement('div');
  formContainer.innerHTML = formHtml;
  const formOverlay = formContainer.firstElementChild;
  
  currentModal.appendChild(formOverlay);

  const cancelBtn = formOverlay.querySelector('.fr-btn-cancel');
  const saveBtn = formOverlay.querySelector('.fr-btn-save');

  cancelBtn.addEventListener('click', () => formOverlay.remove());

  saveBtn.addEventListener('click', async () => {
    const neededByDate = formOverlay.querySelector('.fr-needed-by-date').value;
    const customerImpact = formOverlay.querySelector('.fr-customer-impact').value;
    const seComment = formOverlay.querySelector('.fr-se-comment').value;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Linking...';

    try {
      let finalFeatureRequestId = featureRequestId;
      
      // If no featureRequestId provided, sync from ProductBoard
      if (!finalFeatureRequestId) {
        const featureRequest = await syncProductBoardFeature(appState.pb, feature.id);
        finalFeatureRequestId = featureRequest.id;
      }

      // Create link
      await linkFeatureToPoc(appState.pb, {
        pocId,
        featureRequestId: finalFeatureRequestId,
        useCaseId,
        neededByDate: neededByDate || null,
        seComment,
        customerImpact,
        currentUserId: appState.currentUser.id,
      });

      formOverlay.remove();
      
      // Reload linked features
      await loadLinkedFeatures(pocId, useCaseId);

      // Clear search
      currentModal.querySelector('.fr-search-input').value = '';
      currentModal.querySelector('.fr-search-results').innerHTML = 
        '<div class="fr-search-hint">Feature linked successfully!</div>';

    } catch (error) {
      console.error('[FeatureRequest] Save error:', error);
      alert('Failed to link feature. Please try again.');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Link Feature';
    }
  });
}

/**
 * Load and display linked features
 */
async function loadLinkedFeatures(pocId, useCaseId) {
  const linkedContainer = currentModal.querySelector('.fr-linked-list');
  
  try {
    linkedContainer.innerHTML = '<div class="fr-loading">Loading...</div>';

    const links = await getPocFeatureRequests(appState.pb, pocId);
    
    // Filter by use case if specified
    const filteredLinks = useCaseId 
      ? links.filter(link => link.use_case === useCaseId)
      : links;

    if (filteredLinks.length === 0) {
      linkedContainer.innerHTML = '<div class="fr-no-results">No features linked yet</div>';
      return;
    }

    renderLinkedFeatures(filteredLinks);

  } catch (error) {
    console.error('[FeatureRequest] Load error:', error);
    linkedContainer.innerHTML = '<div class="fr-error">Failed to load linked features</div>';
  }
}

/**
 * Render linked features
 */
function renderLinkedFeatures(links) {
  const linkedContainer = currentModal.querySelector('.fr-linked-list');
  
  linkedContainer.innerHTML = links.map(link => {
    const feature = link.expand?.feature_request;
    if (!feature) return '';

    return `
      <div class="fr-linked-item">
        <div class="fr-linked-header">
          <div class="fr-linked-title">${feature.title}</div>
          <button type="button" class="fr-unlink-btn" data-link-id="${link.id}" title="Unlink">
            🗑️
          </button>
        </div>
        
        <div class="fr-linked-meta">
          <span class="fr-status-badge ${getStatusBadgeClass(feature.status)}">
            ${getStatusLabel(feature.status)}
          </span>
          ${feature.release_version ? `<span class="fr-release">📦 ${feature.release_version}</span>` : ''}
          ${feature.release_date ? `<span class="fr-release-date">📅 ${formatReleaseDate(feature.release_date)}</span>` : ''}
        </div>
        
        ${link.needed_by_date ? `
          <div class="fr-linked-detail">
            <strong>Customer needs by:</strong> ${formatReleaseDate(link.needed_by_date)}
          </div>
        ` : ''}
        
        ${link.customer_impact ? `
          <div class="fr-linked-detail">
            <strong>Impact:</strong>
            <span class="fr-impact-badge ${getImpactBadgeClass(link.customer_impact)}">
              ${displayCustomerImpact(link.customer_impact)}
            </span>
          </div>
        ` : ''}
        
        ${link.se_comment ? `
          <div class="fr-linked-comment">${link.se_comment}</div>
        ` : ''}
        
        <div class="fr-linked-footer">
          <small>Linked by ${link.expand?.created_by?.displayName || link.expand?.created_by?.email || 'Unknown'}</small>
        </div>
      </div>
    `;
  }).join('');

  // Attach unlink button listeners
  linkedContainer.querySelectorAll('.fr-unlink-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Remove this feature request link?')) {
        await handleUnlink(btn.dataset.linkId, pocId, useCaseId);
      }
    });
  });
}

/**
 * Handle unlinking a feature
 */
async function handleUnlink(linkId, pocId, useCaseId) {
  try {
    await unlinkFeatureFromPoc(appState.pb, linkId);
    await loadLinkedFeatures(pocId, useCaseId);
  } catch (error) {
    console.error('[FeatureRequest] Unlink error:', error);
    alert('Failed to unlink feature. Please try again.');
  }
}

/**
 * Show form to create custom feature request
 */
function showCustomFeatureForm(pocId, useCaseId) {
  const formHtml = `
    <div class="fr-custom-form-overlay">
      <div class="fr-custom-form">
        <h4>Create Custom Feature Request</h4>
        <p class="fr-form-hint">Create an internal feature request (not from ProductBoard)</p>
        
        <div class="fr-form-field">
          <label class="fr-label">Title *</label>
          <input type="text" class="fr-custom-title" placeholder="e.g., SAML Single Sign-On" required />
        </div>
        
        <div class="fr-form-field">
          <label class="fr-label">Description</label>
          <textarea class="fr-custom-description" rows="3" 
            placeholder="Detailed description of the feature..."></textarea>
        </div>
        
        <div class="fr-form-field">
          <label class="fr-label">Priority</label>
          <select class="fr-custom-priority">
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        
        <div class="fr-form-field">
          <label class="fr-label">Status</label>
          <select class="fr-custom-status">
            <option value="under_consideration">Under Consideration</option>
            <option value="planned">Planned</option>
            <option value="in_development">In Development</option>
            <option value="released">Released</option>
          </select>
        </div>
        
        <div class="fr-form-actions">
          <button type="button" class="fr-btn-cancel">Cancel</button>
          <button type="button" class="fr-btn-save-custom">Create & Link</button>
        </div>
      </div>
    </div>
  `;

  const formContainer = document.createElement('div');
  formContainer.innerHTML = formHtml;
  const formOverlay = formContainer.firstElementChild;
  
  currentModal.appendChild(formOverlay);

  const cancelBtn = formOverlay.querySelector('.fr-btn-cancel');
  const saveBtn = formOverlay.querySelector('.fr-btn-save-custom');
  const titleInput = formOverlay.querySelector('.fr-custom-title');

  cancelBtn.addEventListener('click', () => formOverlay.remove());

  saveBtn.addEventListener('click', async () => {
    const title = titleInput.value.trim();
    
    if (!title) {
      alert('Please enter a title');
      return;
    }

    const description = formOverlay.querySelector('.fr-custom-description').value;
    const priority = formOverlay.querySelector('.fr-custom-priority').value;
    const status = formOverlay.querySelector('.fr-custom-status').value;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Creating...';

    try {
      // Create custom feature request in database
      const featureRequest = await appState.pb.collection('feature_requests').create({
        source: 'custom',
        title,
        description,
        priority,
        status,
        external_id: '',
        external_url: '',
      });

      // Now show link details form
      formOverlay.remove();
      
      // Create a fake feature object for the link form
      const customFeature = {
        id: featureRequest.external_id || `custom-${featureRequest.id}`,
        title: featureRequest.title,
        status: featureRequest.status,
        priority: featureRequest.priority,
      };

      showLinkDetailsForm(customFeature, pocId, useCaseId, featureRequest.id);

    } catch (error) {
      console.error('[FeatureRequest] Custom create error:', error);
      alert('Failed to create custom feature. Please try again.');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Create & Link';
    }
  });
}

/**
 * Close the modal
 */
function closeModal() {
  if (currentModal) {
    currentModal.remove();
    currentModal = null;
  }
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
}

/**
 * Export for use in POC cards
 */
export { closeModal };