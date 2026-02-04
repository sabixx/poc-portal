// poc_metrics.js - Shared metrics and use case display for POC cards
import { renderActiveUseCaseTable, attachUseCaseTableListeners } from "./use_case_table.js";
import { appState } from "./state.js";

/**
 * Renders the compact metrics section with progress, stats, and toggle button
 */
export function renderPocMetrics({ completedUc, totalUc, avgRating, feedbackCount, erCount = 0, showProductBoardBtn = false, showRemoveBtn = false }) {
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
        <button type="button" class="poc-toggle-details-btn${erCount > 0 ? ' poc-toggle-details-btn--has-ers' : ''}" data-er-count="${erCount}">
          ${erCount > 0 ? `Use Cases & Requests (${erCount})` : 'Show Use Case Details'}
        </button>
        ${showProductBoardBtn ? `
          <button type="button" class="poc-link-productboard-btn" title="Link to ProductBoard">
            🔗 ProductBoard
          </button>
        ` : ''}
        ${showRemoveBtn ? `
          <button type="button" class="poc-remove-btn" title="Remove POC">
            Remove
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Computes metrics from use cases (ratings, feedback count)
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
 * NOW ACCEPTS featureRequests AND customerName
 */
export function renderUseCaseDetails(pocUcs, pocId, featureRequests = [], customerName = '') {
  return `
    <div class="poc-details hidden">
      ${renderActiveUseCaseTable(pocUcs, pocId, featureRequests, customerName)}
    </div>
  `;
}

/**
 * Attaches event listeners for metrics section (toggle, ProductBoard, Remove)
 * NOW ACCEPTS onRefresh callback
 */
export function attachMetricsListeners(card, pocId, pbLinks, showProductBoardLinkModal, pb, onRefresh = null) {
  // Toggle use case details
  const toggleBtn = card.querySelector(".poc-toggle-details-btn");
  const detailsEl = card.querySelector(".poc-details");

  if (toggleBtn && detailsEl) {
    toggleBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      const isHidden = detailsEl.classList.contains("hidden");
      detailsEl.classList.toggle("hidden", !isHidden);

      const erCount = parseInt(toggleBtn.dataset.erCount) || 0;
      if (isHidden) {
        toggleBtn.textContent = erCount > 0 ? "Hide Use Cases & Requests" : "Hide Use Case Details";
      } else {
        toggleBtn.textContent = erCount > 0 ? `Use Cases & Requests (${erCount})` : "Show Use Case Details";
      }
    });
  }

  // ProductBoard button (POC level)
  const pbBtn = card.querySelector(".poc-link-productboard-btn");
  if (pbBtn && showProductBoardLinkModal) {
    pbBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      // Pass refresh callback to modal
      showProductBoardLinkModal(pb, pocId, null, onRefresh);
    });
  }

  // Remove button - soft deletes the POC
  const removeBtn = card.querySelector(".poc-remove-btn");
  if (removeBtn) {
    removeBtn.addEventListener("click", async (evt) => {
      evt.stopPropagation();

      if (!confirm("Are you sure you want to remove this POC? This action cannot be undone.")) {
        return;
      }

      try {
        await appState.pb.collection("pocs").update(pocId, {
          is_active: false,
          deregistered_at: new Date().toISOString()
        });

        // Fade out and remove card
        card.style.transition = "opacity 0.3s ease-out";
        card.style.opacity = "0";
        setTimeout(() => card.remove(), 300);
      } catch (err) {
        console.error("[POC-Metrics] Failed to remove POC:", err);
        alert("Failed to remove POC. Please try again.");
      }
    });
  }

  // Attach use case table listeners with refresh callback
  attachUseCaseTableListeners(card, onRefresh);
}