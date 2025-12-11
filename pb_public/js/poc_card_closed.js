// poc_card_closed.js - VERSION v4 PERFORMANCE OPTIMIZED
// Uses pre-loaded cached data instead of per-POC API calls
import { appState } from "./state.js";
import { formatDate, getPucForPoc } from "./helpers.js";
import { showPocDetail } from "./poc_detail.js";
import { renderProductBoardBadges, showProductBoardLinkModal } from "./productboard.js";
import { showFeatureRequestModal } from "./feature_request_modal.js";
import { 
  computeUseCaseMetrics, 
  renderPocMetrics, 
  renderUseCaseDetails, 
  attachMetricsListeners 
} from "./poc_metrics.js";

console.log('[POC-Card-Closed] VERSION 4.0 - Performance optimized with cached data');

const DAY_MS = 1000 * 60 * 60 * 24;
const HOURS_PER_DAY = 8;

function parseDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function workingDaysBetween(start, end) {
  if (!start || !end) return 0;
  let s = new Date(start);
  let e = new Date(end);
  if (e < s) return 0;

  let days = 0;
  while (s <= e) {
    const day = s.getDay();
    if (day !== 0 && day !== 6) {
      days++;
    }
    s.setDate(s.getDate() + 1);
  }
  return days;
}

// ---------------------------------------------------------------------
// Get feature requests from cache
// ---------------------------------------------------------------------

function getFeatureRequestsFromCache(pocId) {
  return appState.featureRequestsByPoc?.get(pocId) || [];
}

// ---------------------------------------------------------------------
// Outcome labels + pill classes
// ---------------------------------------------------------------------

function labelTechnical(value) {
  switch (value) {
    case "win": return "Win";
    case "loss": return "Loss";
    case "other": return "Other";
    case "unknown":
    default: return "Unknown";
  }
}

function labelCommercial(value) {
  switch (value) {
    case "now_customer": return "Won as Customer";
    case "lost": return "Lost";
    case "no_decision": return "No Decision Yet";
    case "other": return "Other";
    case "unknown":
    default: return "Unknown";
  }
}

function commercialOutcomeClass(value) {
  switch (value) {
    case "now_customer": return "poc-outcome-pill poc-outcome-pill--win";
    case "lost": return "poc-outcome-pill poc-outcome-pill--loss";
    case "no_decision": return "poc-outcome-pill poc-outcome-pill--neutral";
    case "other":
    case "unknown":
    default: return "poc-outcome-pill poc-outcome-pill--muted";
  }
}

function technicalOutcomeClass(value) {
  switch (value) {
    case "win": return "poc-outcome-pill poc-outcome-pill--win";
    case "loss": return "poc-outcome-pill poc-outcome-pill--loss";
    case "other": return "poc-outcome-pill poc-outcome-pill--neutral";
    case "unknown":
    default: return "poc-outcome-pill poc-outcome-pill--muted";
  }
}

// ---------------------------------------------------------------------
// Render ONE closed / in-review POC card - PERFORMANCE OPTIMIZED
// ---------------------------------------------------------------------

export async function renderClosedPocCard(p) {
  const pocUcs = getPucForPoc(p.id, appState.allPuc) || [];
  const card = document.createElement("div");
  card.className = "poc-card poc-card-closed";

  const pocStart = parseDate(p.poc_start_date);
  const pocEndPlan = parseDate(p.poc_end_date_plan);
  const lastUpdate = p.last_daily_update_at ? new Date(p.last_daily_update_at) : null;
  const aebValue = p.aeb || p.AEB || "";

  // ----- UC stats & metrics using common module ----------------------
  const metrics = computeUseCaseMetrics(pocUcs);
  const { totalUc, completedUc, avgRating, feedbackCount } = metrics;

  // ----- Find latest completed date for actual end date -------------
  let latestCompletedAt = null;
  pocUcs.forEach((puc) => {
    if (puc.is_completed && puc.completed_at) {
      const c = new Date(puc.completed_at);
      if (!Number.isNaN(c.getTime())) {
        if (!latestCompletedAt || c > latestCompletedAt) {
          latestCompletedAt = c;
        }
      }
    }
  });

  // ----- actual end date + duration ---------------------------------
  let actualEndDate = null;
  if (lastUpdate && latestCompletedAt) {
    actualEndDate = lastUpdate > latestCompletedAt ? lastUpdate : latestCompletedAt;
  } else {
    actualEndDate = lastUpdate || latestCompletedAt || null;
  }

  let pocDurationLabel = "–";
  if (pocStart && actualEndDate) {
    const diffMs = actualEndDate - pocStart;
    const days = diffMs > 0 ? Math.round(diffMs / DAY_MS) : 0;
    pocDurationLabel = `${days} days`;
  }

  // completed in time / late
  let closeTimingLabel = "";
  let timingIcon = "";
  if (actualEndDate && pocEndPlan) {
    const diff = (actualEndDate - pocEndPlan) / DAY_MS;
    if (diff < -0.5) {
      closeTimingLabel = "early";
      timingIcon = "🎯";
    } else if (diff > 0.5) {
      closeTimingLabel = "late";
      timingIcon = "⚠️";
    } else {
      closeTimingLabel = "on time";
      timingIcon = "✓";
    }
  }

  const technicalResult = p.technical_result || "unknown";
  const commercialResult = p.commercial_result || "unknown";
  const overallLabel = labelCommercial(commercialResult);
  const seComment = p.se_comment || "";

  const allUseCasesCompleted = totalUc > 0 && completedUc === totalUc;

  // "in review" rules
  const now = appState.asOfDate ? new Date(appState.asOfDate) : new Date();
  const lastUpdateAgeDays = lastUpdate != null ? (now.getTime() - lastUpdate.getTime()) / DAY_MS : null;
  const lastUpdateOlderThan2Days = lastUpdateAgeDays != null && lastUpdateAgeDays >= 2;

  // POC should be in review if:
  // 1. All use cases completed AND no commercial result set, OR
  // 2. Last update older than 2 days (regardless of completion) AND no commercial result set
  const shouldBeInReviewByProgress = allUseCasesCompleted;
  const shouldBeInReviewByStaleUpdate = lastUpdateOlderThan2Days;
  
  const isInReview = (shouldBeInReviewByProgress || shouldBeInReviewByStaleUpdate) && 
                     (!commercialResult || commercialResult === "unknown");

  const currentUser = appState.currentUser;
  const isOwnPoc = currentUser && p.se === currentUser.id;
  const canEditOutcome = currentUser && (
    currentUser.role === "manager" ||
    currentUser.role === "ae" ||
    currentUser.role === "pm" ||
    (currentUser.role === "se" && isOwnPoc)
  );

  const commClass = commercialOutcomeClass(commercialResult);
  const techClass = technicalOutcomeClass(technicalResult);

  // ProductBoard links
  const pbLinks = p.productboard_links || [];
  const pbBadgesHtml = renderProductBoardBadges(pbLinks);

  // ----- IMPROVED HEADER: Focus on Customer + Outcome ---------------
  const headerHtml = `
    <div class="poc-header poc-header-improved">
      <div class="poc-header-main">
        <div class="poc-customer-outcome-row">
          <h3 class="poc-customer-name">${p.customer_name || "Unknown Customer"}</h3>
          ${!isInReview ? `
            <span class="${commClass} poc-outcome-badge-large">
              ${overallLabel}
            </span>
          ` : `
            <span class="poc-status-badge risk-at_risk">
              In Review
            </span>
          `}
        </div>
        
        <div class="poc-meta-row">
          ${p.product ? `<span class="poc-meta-item poc-product-tag"><strong>Product:</strong> ${p.product}</span>` : ""}
          ${p.partner ? `<span class="poc-meta-item"><strong>Partner:</strong> ${p.partner}</span>` : ""}
          <span class="poc-meta-item poc-aeb-editable">
            <strong>AEB:</strong> 
            <span class="poc-aeb-display">${aebValue ? `$${aebValue}` : "–"}</span>
            ${canEditOutcome ? `<button type="button" class="poc-aeb-edit-btn" title="Edit AEB">✎</button>` : ""}
          </span>
          ${pocDurationLabel !== "–" ? `<span class="poc-meta-item"><strong>Duration:</strong> ${pocDurationLabel}${closeTimingLabel ? ` <span class="poc-timing-badge">${timingIcon} ${closeTimingLabel}</span>` : ""}</span>` : ""}
        </div>

        ${pbBadgesHtml}
      </div>
      
      <div class="poc-header-dates-compact">
        <div class="poc-date-compact">
          <span class="poc-date-label">Started</span>
          <span class="poc-date-value">${formatDate(p.poc_start_date) || "–"}</span>
        </div>
        <div class="poc-date-compact">
          <span class="poc-date-label">${actualEndDate ? "Ended" : "Est. End"}</span>
          <span class="poc-date-value">${actualEndDate ? formatDate(actualEndDate) : formatDate(p.poc_end_date_plan) || "–"}</span>
        </div>
      </div>
    </div>
  `;

  // ----- COMPACT USE-CASE METRICS using common module ---------------
  const useCaseMetricsHtml = renderPocMetrics({
    completedUc,
    totalUc,
    avgRating,
    feedbackCount,
    showProductBoardBtn: false
  });

  // Get feature request summary FROM CACHE (NO API CALL!)
  const featureRequests = getFeatureRequestsFromCache(p.id);
  let frSummaryHtml = '';
  if (featureRequests.length > 0) {
    // Render sync version using cached data
    frSummaryHtml = `
      <div class="fr-summary fr-summary-compact" style="cursor: pointer;">
        <span class="fr-summary-icon">🔗</span>
        <span class="fr-summary-count">${featureRequests.length} Feature Request${featureRequests.length !== 1 ? 's' : ''}</span>
      </div>
    `;
  }

  // ----- OUTCOME block (edit vs read-only) --------------------------
  let outcomeHtml = "";

  if (isInReview && canEditOutcome) {
    // EDITING / FINALIZING STATE - with Save and ProductBoard buttons
    outcomeHtml = `
      <div class="poc-outcome-edit-section">
        <div class="poc-outcome-edit-header">
          <h4>Finalize POC Outcome</h4>
          <p class="poc-outcome-hint">Save technical details and comments, or complete the POC by selecting an overall outcome</p>
        </div>
        
        <div class="poc-outcome-fields">
          <label class="poc-outcome-field">
            <span class="poc-field-label">Overall Outcome *</span>
            <select class="poc-outcome-comm">
              <option value="unknown">Select outcome...</option>
              <option value="now_customer">Won as Customer</option>
              <option value="lost">Lost</option>
              <option value="no_decision">No Decision Yet</option>
              <option value="other">Other</option>
            </select>
          </label>
          
          <label class="poc-outcome-field">
            <span class="poc-field-label">Technical Result</span>
            <select class="poc-outcome-tech">
              <option value="unknown">Unknown</option>
              <option value="win">Win</option>
              <option value="loss">Loss</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        
        <label class="poc-outcome-comment-field">
          <span class="poc-field-label">SE Comment</span>
          <textarea class="poc-outcome-comment" rows="3"
            placeholder="Summary of outcome, next steps, and key learnings...">${seComment}</textarea>
        </label>
        
        <div class="poc-outcome-actions">
          <button type="button" class="poc-link-productboard-btn poc-outcome-pb-btn" data-poc-id="${p.id}">
            🔗 ProductBoard
          </button>
          <div class="poc-outcome-spacer"></div>
          <button type="button" class="poc-outcome-save-btn">
            Save Changes
          </button>
          <button type="button" class="poc-outcome-complete-btn">
            Complete POC
          </button>
        </div>
      </div>
    `;
  } else if (!isInReview && (technicalResult !== "unknown" || seComment)) {
    // READ-ONLY: show technical + comment if available
    outcomeHtml = `
      <div class="poc-outcome-readonly">
        ${technicalResult !== "unknown" ? `
          <div class="poc-outcome-tech-row">
            <span class="poc-meta-label">Technical Result:</span>
            <span class="${techClass}">${labelTechnical(technicalResult)}</span>
          </div>
        ` : ""}
        
        ${seComment ? `
          <div class="poc-comment-section">
            <span class="poc-meta-label">SE Comment</span>
            <div class="poc-comment-bubble">${seComment}</div>
          </div>
        ` : ""}
      </div>
    `;
  }

  // ----- BODY using common module ------------------------------------
  const bodyHtml = `
    <div class="poc-closed-body">
      ${useCaseMetricsHtml}
      ${frSummaryHtml}
      ${outcomeHtml}
      ${renderUseCaseDetails(pocUcs, p.id)}
    </div>
  `;

  card.innerHTML = `
    <div class="poc-card-inner">
      ${headerHtml}
      ${bodyHtml}
    </div>
  `;

  // Attach metrics listeners (toggle button, use case table, etc.)
  attachMetricsListeners(card, p.id, pbLinks, showProductBoardLinkModal);

  // Feature Request button (POC level) - make summary clickable
  const frBtn = card.querySelector('.fr-summary');
  if (frBtn) {
    frBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      showFeatureRequestModal({ pocId: p.id });
    });
  }

  // AEB editing (for authorized users)
  if (canEditOutcome) {
    const aebDisplay = card.querySelector(".poc-aeb-display");
    const aebEditBtn = card.querySelector(".poc-aeb-edit-btn");

    if (aebEditBtn && aebDisplay) {
      aebEditBtn.addEventListener("click", async (evt) => {
        evt.stopPropagation();
        
        const currentValue = aebValue || "";
        const newValue = prompt("Enter AEB value (USD):", currentValue);
        
        if (newValue !== null && newValue !== currentValue) {
          try {
            if (!appState.pb) {
              alert("Database connection not available");
              return;
            }

            const updated = await appState.pb.collection("pocs").update(p.id, {
              aeb: newValue
            });

            Object.assign(p, updated);
            aebDisplay.textContent = newValue ? `$${newValue}` : "–";
          } catch (err) {
            console.error("[POC-PORTAL] Failed to update AEB:", err);
            alert("Failed to update AEB. Please try again.");
          }
        }
      });
    }
  }

  // outcome editing behaviour
  if (isInReview && canEditOutcome) {
    const techSelect = card.querySelector(".poc-outcome-tech");
    const commSelect = card.querySelector(".poc-outcome-comm");
    const commentInput = card.querySelector(".poc-outcome-comment");
    const saveBtn = card.querySelector(".poc-outcome-save-btn");
    const completeBtn = card.querySelector(".poc-outcome-complete-btn");
    const pbBtn = card.querySelector(".poc-outcome-pb-btn");
    const hintEl = card.querySelector(".poc-outcome-hint");

    if (techSelect) techSelect.value = technicalResult;
    if (commSelect) commSelect.value = commercialResult;

    // Save button - saves technical result and comment WITHOUT completing
    if (saveBtn) {
      saveBtn.addEventListener("click", async (evt) => {
        evt.stopPropagation();
        if (!appState.pb) return;

        const techVal = techSelect ? techSelect.value || "unknown" : "unknown";
        const commentVal = commentInput ? commentInput.value || "" : "";

        const patch = {
          technical_result: techVal,
          se_comment: commentVal,
        };

        try {
          saveBtn.disabled = true;
          saveBtn.textContent = "Saving...";

          const updated = await appState.pb.collection("pocs").update(p.id, patch);
          Object.assign(p, updated);
          
          if (hintEl) {
            hintEl.textContent = "Changes saved successfully!";
            hintEl.style.color = "#2e7d32";
            setTimeout(() => {
              hintEl.textContent = "Save technical details and comments, or complete the POC by selecting an overall outcome";
              hintEl.style.color = "";
            }, 3000);
          }

          saveBtn.disabled = false;
          saveBtn.textContent = "Save Changes";
        } catch (err) {
          console.error("[POC-PORTAL] Failed to save POC changes:", err);
          if (hintEl) {
            hintEl.textContent = "Saving failed. Please try again.";
            hintEl.style.color = "#d32f2f";
          }
          saveBtn.disabled = false;
          saveBtn.textContent = "Save Changes";
        }
      });
    }

    // Complete button - requires overall outcome to be selected
    if (completeBtn) {
      completeBtn.addEventListener("click", async (evt) => {
        evt.stopPropagation();
        if (!appState.pb) return;

        const techVal = techSelect ? techSelect.value || "unknown" : "unknown";
        const commVal = commSelect ? commSelect.value || "unknown" : "unknown";

        if (!commVal || commVal === "unknown") {
          if (hintEl) {
            hintEl.textContent = "Please select an overall outcome before completing.";
            hintEl.style.color = "#d32f2f";
          }
          return;
        }

        const patch = {
          technical_result: techVal,
          commercial_result: commVal,
          se_comment: commentInput ? commentInput.value || "" : "",
          is_active: false,
          is_completed: true,
        };

        try {
          completeBtn.disabled = true;
          completeBtn.textContent = "Completing...";

          const updated = await appState.pb.collection("pocs").update(p.id, patch);
          Object.assign(p, updated);
          import("./overview.js").then((mod) => mod.renderMainView());
        } catch (err) {
          console.error("[POC-PORTAL] Failed to complete POC:", err);
          if (hintEl) {
            hintEl.textContent = "Completing failed. Please try again.";
            hintEl.style.color = "#d32f2f";
          }
          completeBtn.disabled = false;
          completeBtn.textContent = "Complete POC";
        }
      });
    }

    // ProductBoard button
    if (pbBtn) {
      pbBtn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        showProductBoardLinkModal(appState.pb, p.id, null);
      });
    }
  }

  return card;
}
