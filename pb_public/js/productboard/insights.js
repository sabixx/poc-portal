// productboard/insights.js
// Create insights in ProductBoard

import { createInsight } from './api.js';
import { IMPORTANCE_LEVELS, DEFAULT_IMPORTANCE } from './config.js';

/**
 * Show insight creation form
 * @param {Object} feature - ProductBoard feature
 * @param {Object} context - { pocId, useCaseId, customerName, pocName, useCaseName, userName }
 * @param {Function} onSuccess - Callback on successful insight creation
 */
export function showInsightForm(feature, context, onSuccess) {
  // Build default insight text
  const defaultInsightText = buildDefaultInsightText(context);
  
  const formHtml = `
    <div class="pb-insight-overlay">
      <div class="pb-insight-form">
        <div class="pb-insight-header">
          <h3>Link Feature: ${escapeHtml(feature.title)}</h3>
          <button type="button" class="pb-close-btn">&times;</button>
        </div>
        
        <div class="pb-insight-body">
          <!-- Importance Selector -->
          <div class="pb-form-field">
            <label class="pb-label">Importance *</label>
            <select class="pb-importance-select" required>
              ${Object.values(IMPORTANCE_LEVELS).map(level => `
                <option value="${level.value}" ${level.value === DEFAULT_IMPORTANCE ? 'selected' : ''}>
                  ${level.label}
                </option>
              `).join('')}
            </select>
          </div>
          
          <!-- Insight Text -->
          <div class="pb-form-field">
            <label class="pb-label">ProductBoard Insight *</label>
            <textarea 
              class="pb-insight-text" 
              rows="10"
              required
              placeholder="Describe customer need..."
            >${defaultInsightText}</textarea>
            <div class="pb-field-hint">
              This will be sent to ProductBoard. Include customer feedback and context.
              <strong>Cannot be empty.</strong>
            </div>
          </div>
          
          <!-- Customer Needs By Date -->
          <div class="pb-form-field">
            <label class="pb-label">Customer Needs By</label>
            <input type="date" class="pb-needed-by-date" />
          </div>
          
          <!-- Customer Impact -->
          <div class="pb-form-field">
            <label class="pb-label">Customer Impact *</label>
            <select class="pb-customer-impact" required>
              <option value="medium">Medium</option>
              <option value="blocker">Blocker</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
          </div>
          
          <!-- SE Notes (internal) -->
          <div class="pb-form-field">
            <label class="pb-label">SE Notes (internal)</label>
            <textarea 
              class="pb-se-notes" 
              rows="3"
              placeholder="Internal notes (not sent to ProductBoard)..."
            ></textarea>
          </div>
        </div>
        
        <div class="pb-insight-footer">
          <button type="button" class="pb-btn pb-btn-secondary pb-cancel-btn">Cancel</button>
          <button type="button" class="pb-btn pb-btn-primary pb-save-btn">Create Insight & Link</button>
        </div>
      </div>
    </div>
  `;
  
  const formContainer = document.createElement('div');
  formContainer.innerHTML = formHtml;
  const formOverlay = formContainer.firstElementChild;
  
  document.body.appendChild(formOverlay);
  
  // Setup event handlers
  setupFormHandlers(formOverlay, feature, context, onSuccess);
}

/**
 * Setup form event handlers
 */
function setupFormHandlers(formOverlay, feature, context, onSuccess) {
  const closeBtn = formOverlay.querySelector('.pb-close-btn');
  const cancelBtn = formOverlay.querySelector('.pb-cancel-btn');
  const saveBtn = formOverlay.querySelector('.pb-save-btn');
  const insightText = formOverlay.querySelector('.pb-insight-text');
  
  // Close handlers
  const closeForm = () => formOverlay.remove();
  closeBtn.addEventListener('click', closeForm);
  cancelBtn.addEventListener('click', closeForm);
  
  // Close on overlay click
  formOverlay.addEventListener('click', (e) => {
    if (e.target === formOverlay) {
      closeForm();
    }
  });
  
  // Save handler
  saveBtn.addEventListener('click', async () => {
    const formData = {
      insightText: insightText.value.trim(),
      importance: formOverlay.querySelector('.pb-importance-select').value,
      neededByDate: formOverlay.querySelector('.pb-needed-by-date').value,
      customerImpact: formOverlay.querySelector('.pb-customer-impact').value,
      seNotes: formOverlay.querySelector('.pb-se-notes').value
    };
    
    // Validate
    if (!formData.insightText || formData.insightText.length === 0) {
      alert('ProductBoard Insight cannot be empty. Please add customer feedback.');
      insightText.focus();
      return;
    }
    
    // Disable button and show loading state
    saveBtn.disabled = true;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Creating Insight...';
    
    try {
      // Create insight in ProductBoard
      const insight = await createInsight({
        featureId: feature.id,
        insightText: formData.insightText,
        importance: formData.importance,
        customerName: context.customerName,
        pocName: context.pocName,
        useCaseName: context.useCaseName,
        userName: context.userName
      });
      
      console.log('[ProductBoard Insights] Insight created:', insight.insightId);
      
      // Close form
      closeForm();
      
      // Call success callback with form data and insight
      if (onSuccess) {
        onSuccess({
          feature,
          formData,
          insight
        });
      }
      
    } catch (error) {
      console.error('[ProductBoard Insights] Create insight error:', error);
      alert(`Failed to create insight: ${error.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });
}

/**
 * Build default insight text
 */
function buildDefaultInsightText(context) {
  let text = '';
  
  if (context.customerName) {
    text += `Customer: ${context.customerName}\n`;
  }
  
  if (context.pocName) {
    text += `POC: ${context.pocName}\n`;
  }
  
  if (context.useCaseName) {
    text += `Use Case: ${context.useCaseName}\n`;
  }
  
  text += '\nCustomer Comment:\n';
  text += '[Add customer feedback here]\n';
  
  if (context.userName) {
    text += `\n— ${context.userName}`;
  }
  
  return text;
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}