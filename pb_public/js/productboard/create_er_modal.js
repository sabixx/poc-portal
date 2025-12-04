// productboard/create_er_modal.js
// Dialog for creating new ProductBoard feature requests

console.log('[ProductBoard] create_er_modal.js loaded');

/**
 * Show create ER modal
 */
export function showCreateERModal() {
  console.log('[ProductBoard] showCreateERModal() called');

  // Remove any existing *create-er* modal
  const existing = document.querySelector('.pb-create-er-modal-overlay');
  if (existing) {
    existing.remove();
  }

  const overlay = createERModalHTML();
  document.body.appendChild(overlay);

  // Setup event listeners
  setupCreateERListeners(overlay);
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
            <option value="">Select product...</option>
            <option value="Certificate Manager SaaS">Certificate Manager SaaS</option>
            <option value="Certificate Manager SH">Certificate Manager SH</option>
            <option value="Secrets Hub SaaS">Secrets Hub SaaS</option>
            <option value="Secrets Hub SH">Secrets Hub SH</option>
            <option value="Platform">Platform</option>
          </select>
        </div>
        
        <div class="pb-form-row">
          <div class="pb-form-group">
            <label for="er-impact">Customer Impact</label>
            <select id="er-impact" class="pb-select">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          
          <div class="pb-form-group">
            <label for="er-needed-by">Needed By</label>
            <input 
              type="date" 
              id="er-needed-by" 
              class="pb-input"
            />
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
  const product = document.getElementById('er-product').value;
  const impact = document.getElementById('er-impact').value;
  const neededBy = document.getElementById('er-needed-by').value;
  const comment = document.getElementById('er-comment').value.trim();
  
  // Validate
  if (!title) {
    alert('Please enter a title');
    document.getElementById('er-title').focus();
    return;
  }
  
  if (!product) {
    alert('Please select a product');
    document.getElementById('er-product').focus();
    return;
  }
  
  // TODO: Implement actual creation logic
  console.log('[ProductBoard] Create ER - TO BE IMPLEMENTED:', {
    title,
    description,
    product,
    impact,
    neededBy,
    comment
  });
  
  // For now, just close the modal
  modal.remove();
}
