// productboard/create_er_modal.js
// Dialog for creating new ProductBoard feature requests

import { createFeature, syncFeatureToLocal, createLink, getProducts } from './api.js';
import { showSuccessNotification, showErrorNotification } from './error_handler.js';
import { showTimeframeSelector } from '../timeframe_selector.js';

console.log('[ProductBoard] create_er_modal.js loaded');

// Module-level state to hold context
let modalContext = {
  pb: null,
  pocId: null,
  useCaseId: null,
  refreshCallback: null
};

/**
 * Show create ER modal
 * @param {Object} pb - PocketBase instance
 * @param {string} pocId - POC ID
 * @param {string} useCaseId - Use case ID (optional)
 * @param {Function} refreshCallback - Callback to refresh parent view (optional)
 */
export function showCreateERModal(pb = null, pocId = null, useCaseId = null, refreshCallback = null) {
  console.log('[ProductBoard] showCreateERModal() called', { pocId, useCaseId });

  // Store context for use in handleCreateER
  modalContext = {
    pb: pb || window.pb,
    pocId: pocId || window.currentPocId,
    useCaseId: useCaseId || window.currentUseCaseId,
    refreshCallback
  };

  // Remove any existing *create-er* modal
  const existing = document.querySelector('.pb-create-er-modal-overlay');
  if (existing) {
    existing.remove();
  }

  const overlay = createERModalHTML();
  document.body.appendChild(overlay);

  // Setup event listeners
  setupCreateERListeners(overlay);

  // Load products from ProductBoard
  loadProductsIntoSelect();
}

/**
 * Load products from ProductBoard into the select dropdown
 * Products now come as objects with {id, name}
 */
async function loadProductsIntoSelect() {
  const select = document.getElementById('er-product');
  if (!select) return;

  try {
    const products = await getProducts();

    select.innerHTML = '<option value="">Select product...</option>';
    products.forEach(product => {
      const option = document.createElement('option');
      // Store ID as value, name as display text and data attribute
      option.value = product.id;
      option.dataset.name = product.name;
      option.textContent = product.name;
      select.appendChild(option);
    });

    console.log('[ProductBoard] Loaded', products.length, 'products into create ER modal');
  } catch (error) {
    console.error('[ProductBoard] Failed to load products:', error);
    select.innerHTML = '<option value="">Failed to load products</option>';
  }
}

/**
 * Create modal HTML
 */
function createERModalHTML() {
  const overlay = document.createElement('div');
  // Use the same base overlay class as the main PB modal
  overlay.className = 'pb-modal-overlay pb-create-er-modal-overlay';

  overlay.innerHTML = `
    <div class="pb-modal pb-create-er-modal">
      <div class="pb-modal-header">
        <h2>Create New Feature Request</h2>
        <button class="pb-modal-close" data-action="close">×</button>
      </div>
      
      <div class="pb-modal-body">
        <div class="pb-form-group">
          <label for="er-title">Title *</label>
          <input 
            type="text" 
            id="er-title" 
            class="pb-input" 
            placeholder="Brief description of the feature"
            required
          />
        </div>
        
        <div class="pb-form-group">
          <label for="er-description">Description</label>
          <textarea 
            id="er-description" 
            class="pb-textarea" 
            rows="5"
            placeholder="Detailed description of what's needed and why..."
          ></textarea>
        </div>
        
        <div class="pb-form-group">
          <label for="er-product">Product *</label>
          <select id="er-product" class="pb-select" required>
            <option value="">Loading products...</option>
          </select>
        </div>
        
        <div class="pb-form-row">
          <div class="pb-form-group">
            <label for="er-impact">Customer Impact</label>
            <select id="er-impact" class="pb-select">
              <option value="critical">Critical</option>
              <option value="time_sensitive">Time Sensitive</option>
              <option value="roadmap_candidate" selected>Roadmap Candidate</option>
              <option value="nice_to_have">Nice To Have</option>
            </select>
          </div>

          <div class="pb-form-group">
            <label>Needed By</label>
            <button
              type="button"
              id="er-needed-by-btn"
              class="pb-input pb-timeframe-btn"
              style="text-align: left; cursor: pointer;"
            >
              Select timeframe...
            </button>
            <input type="hidden" id="er-needed-by" />
          </div>
        </div>
        
        <div class="pb-form-group">
          <label for="er-comment">SE Comment</label>
          <textarea
            id="er-comment"
            class="pb-textarea"
            rows="3"
            placeholder="Additional context from SE perspective..."
          ></textarea>
        </div>

        <div class="pb-form-group pb-checkbox-group">
          <label class="pb-checkbox-label">
            <input type="checkbox" id="er-dealbreaker" />
            <span class="pb-checkbox-text">Deal Breaker</span>
            <span class="pb-checkbox-hint">This feature is critical for the deal to close</span>
          </label>
        </div>
      </div>

      <div class="pb-modal-footer">
        <button class="pb-btn-secondary" data-action="close">Cancel</button>
        <button class="pb-btn-primary" data-action="create">
          Create Feature Request
        </button>
      </div>
    </div>
  `;
  
  return overlay;
}

/**
 * Setup event listeners
 */
function setupCreateERListeners(modal) {
  // Close buttons
  modal.querySelectorAll('[data-action="close"]').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.remove();
    });
  });

  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  // Timeframe selector button
  const timeframeBtn = modal.querySelector('#er-needed-by-btn');
  const timeframeInput = modal.querySelector('#er-needed-by');
  if (timeframeBtn) {
    timeframeBtn.addEventListener('click', () => {
      showTimeframeSelector({
        currentValue: timeframeInput.value,
        onSelect: (result) => {
          timeframeInput.value = result.value || '';
          timeframeBtn.textContent = result.display || 'Select timeframe...';
        }
      });
    });
  }

  // Create button
  const createBtn = modal.querySelector('[data-action="create"]');
  createBtn.addEventListener('click', async () => {
    await handleCreateER(modal);
  });
}

/**
 * Handle create ER
 */
async function handleCreateER(modal) {
  const title = document.getElementById('er-title').value.trim();
  const description = document.getElementById('er-description').value.trim();
  const productSelect = document.getElementById('er-product');
  const productId = productSelect.value;
  const productName = productSelect.selectedOptions[0]?.dataset?.name || '';
  const impact = document.getElementById('er-impact').value;
  const neededBy = document.getElementById('er-needed-by').value;
  const comment = document.getElementById('er-comment').value.trim();
  const isDealBreaker = document.getElementById('er-dealbreaker').checked;

  // Validate
  if (!title) {
    alert('Please enter a title');
    document.getElementById('er-title').focus();
    return;
  }

  if (!productId) {
    alert('Please select a product');
    document.getElementById('er-product').focus();
    return;
  }

  // Get the create button and show loading state
  const createBtn = modal.querySelector('[data-action="create"]');
  const originalBtnText = createBtn.textContent;
  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';

  try {
    console.log('[ProductBoard] Creating ER in ProductBoard:', { title, productId, productName });

    // 1. Create the feature in ProductBoard via backend
    const createdFeature = await createFeature({
      title,
      description,
      productId,
      productName
    });

    console.log('[ProductBoard] Feature created in ProductBoard:', createdFeature.id);
    console.log('[ProductBoard] Full createFeature response:', createdFeature);

    // 2. Sync the feature to local database
    const { pb, pocId, useCaseId, refreshCallback } = modalContext;

    if (!pb) {
      throw new Error('PocketBase instance not available');
    }

    const localFeature = await syncFeatureToLocal(pb, {
      id: createdFeature.id,
      title: createdFeature.title,
      description: createdFeature.description,
      status: createdFeature.status,
      url: createdFeature.url,
      product: productName
    });

    console.log('[ProductBoard] Feature synced to local DB:', localFeature.id);

    // 3. Link to POC/use case if we have context
    if (pocId) {
      console.log('[ProductBoard] Linking to POC:', pocId, 'Use case:', useCaseId);

      await createLink(pb, pocId, localFeature.id, useCaseId, {
        customerImpact: impact,
        neededByDate: neededBy,
        seComment: comment,
        isDealBreaker: isDealBreaker
      });

      console.log('[ProductBoard] Link created successfully');
    }

    // 4. Show success notification
    showSuccessNotification('Feature request created and linked successfully');

    // 5. Trigger refresh callback if provided
    if (refreshCallback && typeof refreshCallback === 'function') {
      console.log('[ProductBoard] Triggering refresh callback');
      try {
        refreshCallback();
      } catch (e) {
        console.error('[ProductBoard] Refresh callback error:', e);
      }
    }

    // 6. Close the modal
    modal.remove();

  } catch (error) {
    console.error('[ProductBoard] Create ER error:', error);
    showErrorNotification(error.message || 'Failed to create feature request');

    // Reset button state
    createBtn.disabled = false;
    createBtn.textContent = originalBtnText;
  }
}
