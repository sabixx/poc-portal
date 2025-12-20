// productboard/modal.js
// ProductBoard Modal - COMPLETE WORKING VERSION
console.log('[ProductBoard Modal] VERSION 2.2 - With refresh callback support');

import { searchFeatures, getProducts, getExistingLinks, createLink, deleteLink, getFeature } from './api.js';
import { loadAndRenderHotERs, loadAndRenderRecentFeatures } from './suggestions.js';
import { MIN_SEARCH_LENGTH, SEARCH_DEBOUNCE_MS } from './config.js';
import { 
  handleProductBoardError, 
  showErrorNotification, 
  showSuccessNotification,
  isAuthorized,
  showAuthorizationError 
} from './error_handler.js';
import { showCreateERModal } from './create_er_modal.js';

let currentModal = null;
let searchTimeout = null;
let onRefreshCallback = null;

/**
 * Show ProductBoard link modal
 * @param {Object} pb - PocketBase instance
 * @param {string} pocId - POC ID
 * @param {string} useCaseId - Use case ID (optional)
 * @param {Function} refreshCallback - Callback to refresh parent view after changes (optional)
 * @param {Object} options - Additional options
 */
export async function showProductBoardLinkModal(pb, pocId, useCaseId = null, refreshCallback = null, options = {}) {
  // Handle old signature: (pb, pocId, useCaseId, options)
  if (refreshCallback && typeof refreshCallback === 'object' && !options) {
    options = refreshCallback;
    refreshCallback = null;
  }
  
  console.log('[ProductBoard Modal] Opening modal', { pocId, useCaseId, hasRefreshCallback: !!refreshCallback });
  
  // Store refresh callback
  onRefreshCallback = refreshCallback;
  
  // Check authorization
  if (!isAuthorized(pb)) {
    showAuthorizationError(true);
    return;
  }
  
  // If useCaseId looks like it might be a poc_use_case ID, resolve it
  let actualUseCaseId = useCaseId;
  if (useCaseId) {
    try {
      console.log('[ProductBoard Modal] Attempting to resolve poc_use_case:', useCaseId);
      
      // Try to get it as a poc_use_case first
      const pocUseCase = await pb.collection('poc_use_cases').getOne(useCaseId, {
        $autoCancel: false
      }).catch(err => {
        console.log('[ProductBoard Modal] Not a poc_use_case (or no permission):', err.status);
        return null;
      });
      
      if (pocUseCase) {
        console.log('[ProductBoard Modal] Found poc_use_case:', pocUseCase);
        
        // If successful, extract the actual use_case ID
        if (pocUseCase.use_case) {
          actualUseCaseId = pocUseCase.use_case;
          console.log('[ProductBoard Modal] Resolved poc_use_case to use_case:', actualUseCaseId);
        } else {
          console.warn('[ProductBoard Modal] poc_use_case has no use_case field!');
        }
      } else {
        console.log('[ProductBoard Modal] Using provided ID as use_case ID');
      }
    } catch (error) {
      // If it fails, assume it's already a use_case ID
      console.log('[ProductBoard Modal] Error resolving poc_use_case:', error.message);
    }
  }
  
  // Make globally accessible
  window.pb = pb;
  window.currentPocId = pocId;
  window.currentUseCaseId = actualUseCaseId;
  
  console.log('[ProductBoard Modal] Set globals:', { 
    'window.pb': !!window.pb, 
    'window.currentPocId': window.currentPocId,
    'window.currentUseCaseId': window.currentUseCaseId
  });
  
  const allowCreateER = options.allowCreateER !== false;
  
  // Create modal
  const modal = createModalHTML(allowCreateER);
  document.body.appendChild(modal);
  currentModal = modal;
  
  // Setup events - use actualUseCaseId
  setupEventListeners(pb, pocId, actualUseCaseId);
  
  // Load data - use actualUseCaseId and pass existing links if provided
  await loadModalData(pb, pocId, actualUseCaseId, options.existingLinks);
}

/**
 * Call refresh callback if set
 */
function triggerRefresh() {
  if (onRefreshCallback && typeof onRefreshCallback === 'function') {
    console.log('[ProductBoard Modal] Triggering refresh callback');
    try {
      onRefreshCallback();
    } catch (e) {
      console.error('[ProductBoard Modal] Refresh callback error:', e);
    }
  }
}

/**
 * Create modal HTML
 */
function createModalHTML(allowCreateER) {
  const overlay = document.createElement('div');
  overlay.className = 'pb-modal-overlay';
  overlay.innerHTML = `
    <div class="pb-modal">
      <div class="pb-modal-header">
        <h2>Link POC to ProductBoard</h2>
        <button class="pb-close-btn" type="button" data-action="close">×</button>
      </div>
      
      <div class="pb-modal-body">
        <!-- Existing Links -->
        <div class="pb-existing-links-section" data-element="existing-links-section" style="display:none;">
          <h3>📎 Currently Linked ERs</h3>
          <div data-element="existing-links-list"></div>
        </div>
        
        <!-- Product Filter -->
        <div class="pb-product-section">
          <label class="pb-label">Product</label>
          <select class="pb-product-select" data-element="product-select">
            <option value="">Loading...</option>
          </select>
        </div>
        
        <!-- Search -->
        <div class="pb-search-section">
          <label class="pb-label">Search ProductBoard features</label>
          <input 
            type="text" 
            class="pb-search-input" 
            placeholder="Type to search..."
            data-element="search-input"
          >
        </div>
        
        <!-- Search Results -->
        <div class="pb-search-results" data-element="search-results">
          <div class="pb-search-hint">Type to search ProductBoard...</div>
        </div>
        
        <!-- Hot ERs -->
        <div class="pb-hot-ers-section">
          <h3>🔥 Trending ERs (from Sales Engineers)</h3>
          <div data-element="hot-ers-list">
            <div class="pb-loading">Loading hot ERs...</div>
          </div>
        </div>
        
        <!-- Recent Features -->
        <div class="pb-recent-section">
          <h3>🔄 Recently Updated Features (ProductBoard)</h3>
          <div data-element="recent-list">
            <div class="pb-loading">Loading recent features...</div>
          </div>
        </div>
        
        ${allowCreateER ? `
        <div class="pb-create-er-hint">
          <small>💡 Can't find what you're looking for? Create a new ER only if nothing matches.</small>
        </div>
        <div class="pb-create-er-section">
          <button class="pb-btn pb-btn-secondary pb-btn-sm" type="button" data-action="create-er">
            ➕ Create New ER
          </button>
        </div>
        ` : ''}
      </div>
      
      <div class="pb-modal-footer">
        <button class="pb-btn pb-btn-primary" type="button" data-action="close">Close</button>
      </div>
    </div>
  `;
  
  return overlay;
}

/**
 * Setup event listeners
 */
function setupEventListeners(pb, pocId, useCaseId) {
  // Close
  currentModal.querySelectorAll('[data-action="close"]').forEach(btn => {
    btn.addEventListener('click', closeModal);
  });
  
  // Click outside
  currentModal.addEventListener('click', (e) => {
    if (e.target === currentModal) closeModal();
  });
  
  // Search
  const searchInput = currentModal.querySelector('[data-element="search-input"]');
  const searchResults = currentModal.querySelector('[data-element="search-results"]');
  const productSelect = currentModal.querySelector('[data-element="product-select"]');
  
  searchInput.addEventListener('input', () => {
    handleSearch(searchInput.value.trim(), productSelect.value, searchResults);
  });
  
  productSelect.addEventListener('change', () => {
    if (searchInput.value.trim().length >= MIN_SEARCH_LENGTH) {
      handleSearch(searchInput.value.trim(), productSelect.value, searchResults);
    }
  });
  
  // Event delegation for buttons
  currentModal.addEventListener('click', async (e) => {
    const target = e.target;
    
    if (target.dataset.action === 'link') {
      await handleLink(target, window.pb, window.currentPocId, window.currentUseCaseId);
    } else if (target.dataset.action === 'unlink') {
      await handleUnlink(target, window.pb);
    } else if (target.dataset.action === 'toggle-desc') {
      toggleDescription(target);
    } else if (target.dataset.action === 'create-er') {
      handleCreateER();
    }
  });
}

/**
 * Handle search with debouncing
 */
function handleSearch(query, product, resultsContainer) {
  clearTimeout(searchTimeout);
  
  console.log('[ProductBoard Search] Query:', query, 'Product:', product);
  
  if (query.length < MIN_SEARCH_LENGTH) {
    resultsContainer.innerHTML = '<div class="pb-search-hint">Type to search ProductBoard...</div>';
    return;
  }
  
  resultsContainer.innerHTML = '<div class="pb-loading">Searching...</div>';
  
  searchTimeout = setTimeout(async () => {
    try {
      const features = await searchFeatures(query, product);
      console.log('[ProductBoard Search] Found', features.length, 'features');
      renderSearchResults(resultsContainer, features);
    } catch (error) {
      console.error('[ProductBoard Search] Error:', error);
      resultsContainer.innerHTML = '<div class="pb-error">Search failed</div>';
    }
  }, SEARCH_DEBOUNCE_MS);
}

/**
 * Render search results
 */
function renderSearchResults(container, features) {
  if (features.length === 0) {
    container.innerHTML = '<div class="pb-no-results">No features found</div>';
    return;
  }
  
  container.innerHTML = features.map(f => renderFeatureItem(f)).join('');
}

/**
 * Render feature item
 */
function renderFeatureItem(feature) {
  const desc = feature.description || '';
  const shortDesc = desc.length > 200 ? desc.substring(0, 200) + '...' : desc;
  const cleanShort = stripHTML(shortDesc);
  const cleanFull = stripHTML(desc);
  const hasMore = desc.length > 200;
  
  return `
    <div class="pb-feature-item">
      <div class="pb-feature-info">
        <div class="pb-feature-title">${escapeHtml(feature.title)}</div>
        ${cleanShort ? `
          <div class="pb-feature-description" data-expanded="false">
            <span class="pb-desc-short">${escapeHtml(cleanShort)}</span>
            ${hasMore ? `
              <button class="pb-expand-btn" type="button" data-action="toggle-desc">Show more</button>
              <span class="pb-desc-full" style="display:none;">${escapeHtml(cleanFull)}</span>
            ` : ''}
          </div>
        ` : ''}
        <div class="pb-feature-meta">
          <span class="pb-badge pb-status-${normalizeStatus(feature.status)}">${feature.status}</span>
          <span class="pb-product-tag">${feature.product || '(no product)'}</span>
        </div>
      </div>
      <button 
        class="pb-btn-link" 
        type="button"
        data-action="link"
        data-feature-id="${feature.id}"
      >
        Link
      </button>
    </div>
  `;
}

/**
 * Load modal data
 * @param {Array} existingLinks - Pre-fetched existing links (optional)
 */
async function loadModalData(pb, pocId, useCaseId, existingLinks = null) {
  try {
    // Load products
    await loadProducts();
    
    // Auto-fill product
    if (useCaseId) {
      await autoFillFromUseCase(pb, useCaseId);
    } else {
      await autoFillFromPOC(pb, pocId);
    }
    
    // Load existing links - use provided links or fetch
    let links;
    if (existingLinks) {
      console.log('[ProductBoard Modal] Using pre-fetched links:', existingLinks.length);
      // Filter to this use case if specified
      if (useCaseId) {
        links = existingLinks.filter(link => link.use_case === useCaseId);
      } else {
        links = existingLinks;
      }
      renderExistingLinks(links);
    } else {
      console.log('[ProductBoard Modal] Fetching existing links...');
      links = await loadExistingLinks(pb, pocId, useCaseId);
    }
    
    // Store existing link IDs globally for checking
    window.linkedFeatureIds = new Set();
    links.forEach(link => {
      const featureId = link.expand?.feature_request?.external_id || link.feature_request;
      if (featureId) window.linkedFeatureIds.add(featureId);
    });
    
    // Load Hot ERs
    const hotERsList = currentModal.querySelector('[data-element="hot-ers-list"]');
    await loadAndRenderHotERs(pb, pocId, hotERsList);
    
    // Load recent features
    const recentList = currentModal.querySelector('[data-element="recent-list"]');
    await loadAndRenderRecentFeatures(recentList);
    
    // Mark already-linked buttons
    markLinkedButtons();
    
  } catch (error) {
    console.error('[ProductBoard Modal] Load data error:', error);
  }
}

/**
 * Mark buttons as linked if feature is already linked
 */
function markLinkedButtons() {
  if (!window.linkedFeatureIds) return;
  
  currentModal.querySelectorAll('[data-action="link"]').forEach(button => {
    const featureId = button.dataset.featureId;
    if (window.linkedFeatureIds.has(featureId)) {
      button.textContent = '✓ Linked';
      button.classList.add('pb-btn-linked');
    }
  });
}

/**
 * Load products
 */
async function loadProducts() {
  try {
    const select = currentModal.querySelector('[data-element="product-select"]');
    const products = await getProducts();
    
    select.innerHTML = '<option value="">All Products</option>';
    products.forEach(product => {
      const option = document.createElement('option');
      // Handle both object format {id, name} and legacy string format
      const name = typeof product === 'object' ? product.name : product;
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
    
    console.log('[ProductBoard Modal] Loaded', products.length, 'products');
  } catch (error) {
    console.error('[ProductBoard Modal] Load products error:', error);
  }
}

/**
 * Auto-fill from use case
 */
async function autoFillFromUseCase(pb, useCaseId) {
  try {
    console.log('[ProductBoard Modal] Auto-filling from use case:', useCaseId);
    const useCase = await pb.collection('use_cases').getOne(useCaseId);
    console.log('[ProductBoard Modal] Use case data:', useCase);
    
    if (useCase.product) {
      const select = currentModal.querySelector('[data-element="product-select"]');
      console.log('[ProductBoard Modal] Setting product to:', useCase.product);
      select.value = useCase.product;
      console.log('[ProductBoard Modal] Product select value after set:', select.value);
    } else {
      console.log('[ProductBoard Modal] Use case has no product set');
    }
  } catch (error) {
    console.error('[ProductBoard Modal] Auto-fill error:', error);
  }
}

/**
 * Auto-fill from POC (most common product)
 */
async function autoFillFromPOC(pb, pocId) {
  try {
    const pocUseCases = await pb.collection('poc_use_cases').getFullList({
      filter: `poc = "${pocId}"`,
      expand: 'use_case',
      $autoCancel: false
    });
    
    const productCounts = {};
    pocUseCases.forEach(item => {
      if (item.expand?.use_case?.product) {
        const product = item.expand.use_case.product;
        productCounts[product] = (productCounts[product] || 0) + 1;
      }
    });
    
    const mostCommon = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0];
    
    if (mostCommon) {
      const select = currentModal.querySelector('[data-element="product-select"]');
      select.value = mostCommon[0];
      console.log('[ProductBoard Modal] Auto-filled product from POC:', mostCommon[0]);
    }
  } catch (error) {
    console.error('[ProductBoard Modal] Auto-fill from POC error:', error);
  }
}

/**
 * Render existing links without fetching
 */
function renderExistingLinks(links) {
  const container = currentModal.querySelector('[data-element="existing-links"]');
  if (!container) return;
  
  if (links.length === 0) {
    container.innerHTML = '<div class="pb-no-links">No linked features yet</div>';
    return;
  }
  
  container.innerHTML = links.map(link => renderExistingLink(link)).join('');
}

/**
 * Load existing links (with fetch)
 */
async function loadExistingLinks(pb, pocId, useCaseId) {
  const section = currentModal.querySelector('[data-element="existing-links-section"]');
  const container = currentModal.querySelector('[data-element="existing-links-list"]');
  
  try {
    const links = await getExistingLinks(pb, pocId, useCaseId);
    
    if (links.length === 0) {
      section.style.display = 'none';
      return [];
    }
    
    section.style.display = 'block';
    
    // Fetch fresh ProductBoard data for each linked feature
    const enrichedLinks = await Promise.all(
      links.map(async (link) => {
        const feature = link.expand?.feature_request || {};
        
        // If we have external_id, fetch fresh data from ProductBoard
        if (feature.external_id) {
          try {
            const freshData = await getFeature(feature.external_id);
            return {
              ...link,
              freshFeature: freshData
            };
          } catch (error) {
            console.warn('[ProductBoard] Could not fetch fresh data for', feature.external_id);
          }
        }
        
        return link;
      })
    );
    
    container.innerHTML = enrichedLinks.map(link => renderExistingLink(link)).join('');
    
    console.log('[ProductBoard Modal] Loaded', links.length, 'existing links');
    return links;
  } catch (error) {
    console.error('[ProductBoard Modal] Load existing links error:', error);
    section.style.display = 'none';
    return [];
  }
}

/**
 * Render existing link
 */
function renderExistingLink(link) {
  // Use fresh ProductBoard data if available, otherwise fall back to local data
  const freshFeature = link.freshFeature;
  const localFeature = link.expand?.feature_request || {};
  
  const title = freshFeature?.title || localFeature.title || 'Unknown Feature';
  const status = freshFeature?.status || localFeature.status || 'unknown';
  const product = freshFeature?.product || localFeature.product || '';
  
  return `
    <div class="pb-existing-link-item">
      <div class="pb-link-info">
        <div class="pb-link-title">${escapeHtml(title)}</div>
        <div class="pb-link-meta">
          <span class="pb-badge pb-status-${normalizeStatus(status)}">${status}</span>
          <span class="pb-product-tag">${product || '(no product)'}</span>
        </div>
      </div>
      <button 
        class="pb-btn pb-btn-linked" 
        type="button"
        data-action="unlink"
        data-link-id="${link.id}"
      >
        ✓ Linked
      </button>
    </div>
  `;
}

/**
 * Handle link
 */
async function handleLink(button, pb, pocId, useCaseId) {
  const featureId = button.dataset.featureId;
  
  console.log('[ProductBoard Modal] handleLink called with:', { pocId, useCaseId, featureId });
  
  if (!pocId) {
    alert('POC ID not set');
    return;
  }
  
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Working...';
  
  try {
    // Check if already linked
    const existingLinks = await getExistingLinks(pb, pocId, useCaseId);
    console.log('[ProductBoard Modal] Found', existingLinks.length, 'existing links for useCaseId:', useCaseId);
    
    const alreadyLinked = existingLinks.find(link => 
      link.expand?.feature_request?.external_id === featureId ||
      link.feature_request === featureId
    );
    
    if (alreadyLinked) {
      // Already linked - UNLINK
      await deleteLink(pb, alreadyLinked.id);
      button.textContent = 'Link';
      button.classList.remove('pb-btn-linked');
      console.log('[ProductBoard] Unlinked:', featureId);
    } else {
      // Not linked - LINK
      console.log('[ProductBoard Modal] Creating link with useCaseId:', useCaseId);
      await createLink(pb, pocId, featureId, useCaseId);
      button.textContent = '✓ Linked';
      button.classList.add('pb-btn-linked');
      console.log('[ProductBoard] Linked:', featureId);
    }
    
    // Refresh existing links section
    await loadExistingLinks(pb, pocId, useCaseId);
    
    // Trigger parent refresh
    triggerRefresh();
    
  } catch (error) {
    console.error('[ProductBoard] Link/unlink error:', error);
    
    // Simple permission check
    if (error.status === 400 || error.status === 403 || error.status === 401) {
      showErrorNotification('Not authorized');
    } else {
      const errorMessage = handleProductBoardError(error, 'link/unlink feature');
      if (errorMessage) {
        showErrorNotification(errorMessage);
      }
    }
    
    button.textContent = originalText;
    button.classList.remove('pb-btn-linked');
  } finally {
    button.disabled = false;
  }
}

/**
 * Handle unlink
 */
async function handleUnlink(button, pb) {
  const linkId = button.dataset.linkId;
  
  try {
    await deleteLink(pb, linkId);
    await loadExistingLinks(pb, window.currentPocId, window.currentUseCaseId);
    showSuccessNotification('Link removed');
    triggerRefresh();
    console.log('[ProductBoard] Unlinked:', linkId);
  } catch (error) {
    console.error('[ProductBoard] Unlink error:', error);
    const errorMessage = handleProductBoardError(error, 'remove link');
    if (errorMessage) {
      showErrorNotification(errorMessage);
    }
  }
}

/**
 * Toggle description
 */
function toggleDescription(button) {
  const container = button.closest('.pb-feature-description');
  const isExpanded = container.dataset.expanded === 'true';
  
  const shortSpan = container.querySelector('.pb-desc-short');
  const fullSpan = container.querySelector('.pb-desc-full');
  
  if (isExpanded) {
    shortSpan.style.display = '';
    fullSpan.style.display = 'none';
    button.textContent = 'Show more';
    container.dataset.expanded = 'false';
  } else {
    shortSpan.style.display = 'none';
    fullSpan.style.display = '';
    button.textContent = 'Show less';
    container.dataset.expanded = 'true';
  }
}

/**
 * Handle create ER
 */
function handleCreateER() {
  // Close current modal first
  closeModal();
  
  // Open Create ER modal
  showCreateERModal(window.pb, window.currentPocId, window.currentUseCaseId, onRefreshCallback);
}

/**
 * Close modal
 */
export function closeModal() {
  if (currentModal) {
    currentModal.remove();
    currentModal = null;
  }
}

/**
 * Helpers
 */
function normalizeStatus(status) {
  return (status || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function stripHTML(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}