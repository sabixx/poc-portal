// poc_metrics.js - Shared metrics and use case display for POC cards
import { renderActiveUseCaseTable, attachUseCaseTableListeners } from "./use_case_table.js";
import { appState } from "./state.js";

/**
 * Renders the compact metrics section with progress, stats, and toggle button
 * @param {Object} params
 * @param {number} params.completedUc - Number of completed use cases
 * @param {number} params.totalUc - Total number of use cases
 * @param {string} params.avgRating - Average rating (formatted string or "–")
 * @param {number} params.feedbackCount - Number of use cases with feedback
 * @param {boolean} params.showProductBoardBtn - Whether to show ProductBoard button
 * @returns {string} HTML string for metrics section
 */
export function renderPocMetrics({ completedUc, totalUc, avgRating, feedbackCount, showProductBoardBtn = false }) {
  const completionPct = totalUc > 0 ? Math.round((completedUc / totalUc) * 100) : 0;

  return `
    <div class="poc-metrics-compact">
      <div class="poc-progress-bar-container">
        <div class="poc-progress-header">
          <span class="poc-progress-label">
            ${completedUc}/${totalUc} use cases completed
          </span>
          <span class="poc-progress-pct">${completionPct}%</span>
        </div>
        <div class="poc-progress-bar-bg">
          <div class="poc-progress-bar-fill" style="width: ${completionPct}%;"></div>
        </div>
      </div>
      
      <div class="poc-stats-row">
        <div class="poc-stat-item">
          <span class="poc-stat-icon">⭐</span>
          <span class="poc-stat-value">${avgRating}</span>
          <span class="poc-stat-label">avg rating</span>
        </div>
        <div class="poc-stat-item">
          <span class="poc-stat-icon">💬</span>
          <span class="poc-stat-value">${feedbackCount}</span>
          <span class="poc-stat-label">feedback</span>
        </div>
        <div class="poc-stat-item">
          <span class="poc-stat-icon">📋</span>
          <span class="poc-stat-value">${totalUc}</span>
          <span class="poc-stat-label">total UCs</span>
        </div>
      </div>
      
      <div class="poc-actions-row">
        <button type="button" class="poc-toggle-details-btn">
          Show Use Case Details
        </button>
        ${showProductBoardBtn ? `
          <button type="button" class="poc-link-productboard-btn" title="Link to ProductBoard">
            🔗 ProductBoard
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Computes metrics from use cases (ratings, feedback count)
 * @param {Array} pocUcs - Array of POC use cases
 * @returns {Object} Computed metrics
 */
export function computeUseCaseMetrics(pocUcs) {
  let totalUc = 0;
  let completedUc = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let feedbackCount = 0;

  (pocUcs || []).forEach((puc) => {
    const uc = puc.expand && puc.expand.use_case;
    if (!uc) return;
    if (!puc.is_active && !puc.is_completed) return;

    totalUc++;
    if (puc.is_completed) {
      completedUc++;
    }

    if (typeof puc.rating === "number" && puc.rating > 0) {
      ratingSum += puc.rating;
      ratingCount++;
    }

    // Check for feedback in expanded comments
    if (puc.expand && puc.expand.comments) {
      const hasFeedback = puc.expand.comments.some(comment => 
        comment.kind === "feedback" && comment.text && comment.text.trim() !== ""
      );
      if (hasFeedback) {
        feedbackCount++;
      }
    }
  });

  const avgRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : "–";

  return {
    totalUc,
    completedUc,
    avgRating,
    feedbackCount
  };
}

/**
 * Renders the use case details section with table
 * @param {Array} pocUcs - Array of POC use cases
 * @param {string} pocId - POC ID
 * @returns {string} HTML string for details section
 */
export function renderUseCaseDetails(pocUcs, pocId) {
  return `
    <div class="poc-details hidden">
      ${renderActiveUseCaseTable(pocUcs, pocId)}
    </div>
  `;
}

/**
 * Attaches event listeners for metrics section (toggle, ProductBoard)
 * @param {HTMLElement} card - The POC card element
 * @param {string} pocId - POC ID
 * @param {Array} pbLinks - ProductBoard links
 * @param {Function} showProductBoardLinkModal - Function to show ProductBoard modal
 */
export function attachMetricsListeners(card, pocId, pbLinks, showProductBoardLinkModal, pb) {  
  // Toggle use case details
  const toggleBtn = card.querySelector(".poc-toggle-details-btn");
  const detailsEl = card.querySelector(".poc-details");

  if (toggleBtn && detailsEl) {
    toggleBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      const isHidden = detailsEl.classList.contains("hidden");
      detailsEl.classList.toggle("hidden", !isHidden);
      toggleBtn.textContent = isHidden ? "Hide Use Case Details" : "Show Use Case Details";
    });
  }

  // ProductBoard button (POC level)
  const pbBtn = card.querySelector(".poc-link-productboard-btn");
  if (pbBtn && showProductBoardLinkModal) {
    pbBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      
      showProductBoardLinkModal(pb, pocId, null);
    });
  }

  // Attach use case table listeners (for 🔗 buttons in table rows)
  attachUseCaseTableListeners(card);
}