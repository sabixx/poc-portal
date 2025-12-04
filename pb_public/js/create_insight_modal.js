// create_insight_modal.js - Modal for creating ProductBoard Insights from ERs

let currentModal = null;

/**
 * Show the Create Insight modal
 * @param {Object} params
 * @param {string} params.customerName - POC customer name
 * @param {string} params.featureTitle - Feature request title
 * @param {string} params.featureId - Feature request ID (for linking)
 * @param {string} params.seComment - SE comment from the ER
 * @param {string} params.customerFeedback - Customer feedback (optional)
 * @param {string} params.pocId - POC ID
 * @param {string} params.frLinkId - poc_feature_requests link ID
 */
export function showCreateInsightModal({ 
  customerName, 
  featureTitle, 
  featureId,
  seComment = '', 
  customerFeedback = '',
  pocId,
  frLinkId
}) {
  // Close any existing modal
  if (currentModal) {
    currentModal.remove();
  }

  const modal = document.createElement('div');
  modal.className = 'insight-modal-overlay';
  
  modal.innerHTML = `
    <div class="insight-modal-content">
      <div class="insight-modal-header">
        <h3>📝 Create ProductBoard Insight</h3>
        <h3>just a dummy placeholder. useless without real Pb access</h3>
        <button type="button" class="insight-modal-close">&times;</button>
      </div>
      
      <div class="insight-modal-body">
        <div class="insight-form-section">
          <div class="insight-form-row">
            <label class="insight-label">Feature</label>
            <div class="insight-value insight-feature-title">${escapeHtml(featureTitle)}</div>
          </div>
          
          <div class="insight-form-row">
            <label class="insight-label">Customer / Company</label>
            <input type="text" class="insight-input" id="insight-customer" value="${escapeHtml(customerName)}" />
          </div>
          
          <div class="insight-form-row">
            <label class="insight-label">Insight Title</label>
            <input type="text" class="insight-input" id="insight-title" 
              placeholder="e.g., Customer needs certificate-based auth for compliance" />
          </div>
          
          <div class="insight-form-row">
            <label class="insight-label">Customer Feedback</label>
            <textarea class="insight-textarea" id="insight-customer-feedback" rows="3"
              placeholder="Direct quotes or feedback from the customer...">${escapeHtml(customerFeedback)}</textarea>
          </div>
          
          <div class="insight-form-row">
            <label class="insight-label">SE Notes</label>
            <textarea class="insight-textarea" id="insight-se-notes" rows="3"
              placeholder="Your analysis, context, or recommendations...">${escapeHtml(seComment)}</textarea>
          </div>
          
          <div class="insight-form-row">
            <label class="insight-label">Importance</label>
            <select class="insight-select" id="insight-importance">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          
          <div class="insight-form-row">
            <label class="insight-label">Tags</label>
            <input type="text" class="insight-input" id="insight-tags" 
              placeholder="e.g., enterprise, security, compliance (comma-separated)" />
          </div>
        </div>
        
        <div class="insight-preview-section">
          <h4>Preview</h4>
          <div class="insight-preview-box">
            <div class="insight-preview-title"></div>
            <div class="insight-preview-company"></div>
            <div class="insight-preview-content"></div>
          </div>
        </div>
      </div>
      
      <div class="insight-modal-footer">
        <button type="button" class="insight-btn insight-btn-cancel">Cancel</button>
        <button type="button" class="insight-btn insight-btn-create">
          <span class="insight-btn-icon">📤</span> Create Insight
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  currentModal = modal;

  // Event listeners
  const closeBtn = modal.querySelector('.insight-modal-close');
  const cancelBtn = modal.querySelector('.insight-btn-cancel');
  const createBtn = modal.querySelector('.insight-btn-create');
  
  const titleInput = modal.querySelector('#insight-title');
  const customerInput = modal.querySelector('#insight-customer');
  const feedbackInput = modal.querySelector('#insight-customer-feedback');
  const notesInput = modal.querySelector('#insight-se-notes');
  
  const previewTitle = modal.querySelector('.insight-preview-title');
  const previewCompany = modal.querySelector('.insight-preview-company');
  const previewContent = modal.querySelector('.insight-preview-content');

  // Update preview on input
  function updatePreview() {
    previewTitle.textContent = titleInput.value || '(No title)';
    previewCompany.textContent = `🏢 ${customerInput.value || '(No company)'}`;
    
    const feedback = feedbackInput.value;
    const notes = notesInput.value;
    let content = '';
    if (feedback) content += `"${feedback}"`;
    if (notes) content += (content ? '\n\n' : '') + `SE: ${notes}`;
    previewContent.textContent = content || '(No content)';
  }

  titleInput.addEventListener('input', updatePreview);
  customerInput.addEventListener('input', updatePreview);
  feedbackInput.addEventListener('input', updatePreview);
  notesInput.addEventListener('input', updatePreview);
  
  // Initial preview
  updatePreview();

  // Close handlers
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Create handler
  createBtn.addEventListener('click', async () => {
    const insightData = {
      title: titleInput.value,
      company: customerInput.value,
      customerFeedback: feedbackInput.value,
      seNotes: notesInput.value,
      importance: modal.querySelector('#insight-importance').value,
      tags: modal.querySelector('#insight-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      featureId,
      pocId,
      frLinkId
    };

    if (!insightData.title) {
      alert('Please enter an insight title');
      return;
    }

    createBtn.disabled = true;
    createBtn.innerHTML = '<span class="insight-btn-icon">⏳</span> Creating...';

    try {
      // TODO: Actually create the insight in ProductBoard via API
      // For now, just log and show success
      console.log('[Insight] Creating insight:', insightData);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      alert('✅ Insight created successfully!\n\n(This is a placeholder - ProductBoard API integration pending)');
      closeModal();
    } catch (error) {
      console.error('[Insight] Failed to create:', error);
      alert('Failed to create insight. Please try again.');
      createBtn.disabled = false;
      createBtn.innerHTML = '<span class="insight-btn-icon">📤</span> Create Insight';
    }
  });

  // Focus title input
  titleInput.focus();
}

function closeModal() {
  if (currentModal) {
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
export { closeModal as closeInsightModal };