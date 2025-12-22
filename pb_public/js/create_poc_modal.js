// create_poc_modal.js - Modal for creating new POCs manually
// VERSION 1.0

import { appState } from "./state.js";
import { getProducts } from "./api.js";

console.log("[Create POC Modal] VERSION 1.0");

let currentModal = null;

/**
 * Calculate default dates
 * POC Start: 1 month from today
 * POC End: 3 weeks after POC start
 */
function getDefaultDates() {
  const today = new Date();

  // POC Start: 1 month from today
  const pocStart = new Date(today);
  pocStart.setMonth(pocStart.getMonth() + 1);

  // POC End: 3 weeks after POC start
  const pocEnd = new Date(pocStart);
  pocEnd.setDate(pocEnd.getDate() + 21);

  return {
    pocStart: formatDate(pocStart),
    pocEnd: formatDate(pocEnd)
  };
}

/**
 * Format date as YYYY-MM-DD for input fields
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Get unique products from existing POCs
 */
function getExistingProducts() {
  const products = new Set();
  appState.allPocs.forEach(poc => {
    if (poc.product) {
      products.add(poc.product);
    }
  });
  return Array.from(products).sort();
}

/**
 * Show the Create POC modal
 */
export async function showCreatePocModal() {
  // Close any existing modal
  if (currentModal) {
    currentModal.remove();
  }

  const currentUser = appState.currentUser;
  if (!currentUser) {
    alert("Please log in first");
    return;
  }

  const { pocStart, pocEnd } = getDefaultDates();
  const existingProducts = getExistingProducts();

  // Try to get products from ProductBoard API
  let productBoardProducts = [];
  try {
    productBoardProducts = await getProducts();
  } catch (e) {
    console.log("[Create POC Modal] Could not fetch ProductBoard products:", e);
  }

  // Merge products from POCs and ProductBoard
  const allProducts = new Set(existingProducts);
  productBoardProducts.forEach(p => {
    if (p.name) allProducts.add(p.name);
  });
  const productList = Array.from(allProducts).sort();

  const modal = document.createElement('div');
  modal.className = 'create-poc-modal-overlay';

  modal.innerHTML = `
    <div class="create-poc-modal-content">
      <div class="create-poc-modal-header">
        <h3>Create New POC</h3>
        <button type="button" class="create-poc-modal-close">&times;</button>
      </div>

      <div class="create-poc-modal-body">
        <form id="create-poc-form" class="create-poc-form">
          <!-- SE Email -->
          <div class="create-poc-form-group">
            <label for="poc-se-email">SE Email *</label>
            <input type="email" id="poc-se-email" class="create-poc-input"
              value="${escapeHtml(currentUser.email)}" required>
            <span class="create-poc-hint">Pre-filled with your email. Change if creating for another SE.</span>
          </div>

          <!-- Customer/Prospect -->
          <div class="create-poc-form-group">
            <label for="poc-customer">Customer / Prospect *</label>
            <input type="text" id="poc-customer" class="create-poc-input"
              placeholder="e.g., ACME Bank" required>
          </div>

          <!-- Matching hint -->
          <div class="create-poc-matching-hint">
            <strong>Matching a manually created POC with CloudFormation</strong><br>
              If you need to track a POC <em>before</em> CloudFormation automatically creates one, you can create the POC entry manually.<br><br>

              Once CloudFormation later generates the POC automatically, it will be associated with the existing manual entry <strong>only if</strong> the following three fields match <strong>exactly</strong>:<br>
              <ul>
                <li>SE email</li>
                <li>Customer</li>
                <li>Product</li>
              </ul>
          </div>

          <!-- Product -->
          <div class="create-poc-form-group">
            <label for="poc-product">Product *</label>
            <div class="create-poc-product-wrapper">
              <select id="poc-product-select" class="create-poc-select">
                <option value="">-- Select a product --</option>
                ${productList.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}
                <option value="__custom__">+ Enter custom product name...</option>
              </select>
              <input type="text" id="poc-product-custom" class="create-poc-input hidden"
                placeholder="Enter custom product name">
            </div>
          </div>

          <!-- Partner -->
          <div class="create-poc-form-group">
            <label for="poc-partner">Partner</label>
            <input type="text" id="poc-partner" class="create-poc-input"
              placeholder="e.g., BigPartner GmbH (optional)">
          </div>

          <!-- AEB -->
          <div class="create-poc-form-group">
            <label for="poc-aeb">AEB</label>
            <input type="text" id="poc-aeb" class="create-poc-input"
              placeholder="Revenue number (optional)">
          </div>

          <!-- Date Row -->
          <div class="create-poc-form-row">
            <div class="create-poc-form-group">
              <label for="poc-start-date">POC Start Date *</label>
              <input type="date" id="poc-start-date" class="create-poc-input"
                value="${pocStart}" required>
            </div>

            <div class="create-poc-form-group">
              <label for="poc-end-date">POC End Date *</label>
              <input type="date" id="poc-end-date" class="create-poc-input"
                value="${pocEnd}" required>
            </div>
          </div>

          <div class="create-poc-hint create-poc-hint-dates">
            Default: Start in 1 month, End 3 weeks after start
          </div>
        </form>
      </div>

      <div class="create-poc-modal-footer">
        <button type="button" class="create-poc-btn create-poc-btn-cancel">Cancel</button>
        <button type="button" class="create-poc-btn create-poc-btn-create" id="create-poc-submit">
          <span class="create-poc-btn-icon">+</span> Create POC
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  currentModal = modal;

  // Event listeners
  const closeBtn = modal.querySelector('.create-poc-modal-close');
  const cancelBtn = modal.querySelector('.create-poc-btn-cancel');
  const createBtn = modal.querySelector('#create-poc-submit');
  const form = modal.querySelector('#create-poc-form');

  const productSelect = modal.querySelector('#poc-product-select');
  const productCustom = modal.querySelector('#poc-product-custom');
  const startDateInput = modal.querySelector('#poc-start-date');
  const endDateInput = modal.querySelector('#poc-end-date');

  // Product select change - show/hide custom input
  productSelect.addEventListener('change', () => {
    if (productSelect.value === '__custom__') {
      productCustom.classList.remove('hidden');
      productCustom.focus();
      productCustom.required = true;
    } else {
      productCustom.classList.add('hidden');
      productCustom.value = '';
      productCustom.required = false;
    }
  });

  // Auto-update end date when start date changes
  startDateInput.addEventListener('change', () => {
    const startDate = new Date(startDateInput.value);
    if (!isNaN(startDate.getTime())) {
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 21);
      endDateInput.value = formatDate(endDate);
    }
  });

  // Close handlers
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Escape key to close
  const escHandler = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', escHandler);

  // Create handler
  createBtn.addEventListener('click', async () => {
    // Validate form
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const seEmail = modal.querySelector('#poc-se-email').value.trim();
    const customer = modal.querySelector('#poc-customer').value.trim();
    const partner = modal.querySelector('#poc-partner').value.trim();
    const aeb = modal.querySelector('#poc-aeb').value.trim();
    const pocStartDate = startDateInput.value;
    const pocEndDate = endDateInput.value;

    // Get product - either from select or custom input
    let product = productSelect.value;
    if (product === '__custom__') {
      product = productCustom.value.trim();
    }

    if (!seEmail || !customer || !product) {
      alert('Please fill in all required fields (SE Email, Customer, Product)');
      return;
    }

    if (!pocStartDate || !pocEndDate) {
      alert('Please provide POC start and end dates');
      return;
    }

    // Validate dates
    const startDate = new Date(pocStartDate);
    const endDate = new Date(pocEndDate);
    if (endDate <= startDate) {
      alert('POC end date must be after the start date');
      return;
    }

    createBtn.disabled = true;
    createBtn.innerHTML = '<span class="create-poc-btn-icon">...</span> Creating...';

    try {
      // Use PocketBase authenticated endpoint
      const pb = appState.pb;
      if (!pb || !pb.authStore.isValid) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/pocs/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': pb.authStore.token
        },
        body: JSON.stringify({
          sa_email: seEmail,
          prospect: customer,
          product: product,
          partner: partner || undefined,
          aeb: aeb || undefined,
          poc_start_date: pocStartDate,
          poc_end_date: pocEndDate
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to create POC');
      }

      console.log('[Create POC Modal] POC created:', result);

      // Show success message
      let message = `POC created successfully!\n\nPOC ID: ${result.poc_uid}`;
      if (result.is_new === false) {
        message = `POC already exists.\n\nPOC ID: ${result.poc_uid}`;
      }
      if (result.user_created) {
        message += `\n\nNote: ${result.user_message || `A new user was created for ${result.user_email}. A password reset email has been sent.`}`;
      }

      alert(message);
      closeModal();

      // Trigger a refresh of the POC list
      if (typeof window.refreshPocList === 'function') {
        window.refreshPocList();
      } else {
        // Fallback: reload the page
        window.location.reload();
      }

    } catch (error) {
      console.error('[Create POC Modal] Failed to create POC:', error);
      alert('Failed to create POC: ' + error.message);
      createBtn.disabled = false;
      createBtn.innerHTML = '<span class="create-poc-btn-icon">+</span> Create POC';
    }
  });

  // Focus customer field
  modal.querySelector('#poc-customer').focus();

  // Store escape handler for cleanup
  modal._escHandler = escHandler;
}

function closeModal() {
  if (currentModal) {
    // Clean up escape handler
    if (currentModal._escHandler) {
      document.removeEventListener('keydown', currentModal._escHandler);
    }
    currentModal.remove();
    currentModal = null;
  }
}

function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export for external use
export { closeModal as closeCreatePocModal };
