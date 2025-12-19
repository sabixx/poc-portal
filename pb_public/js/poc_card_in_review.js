// poc_card_in_review.js - VERSION v1.0
// Card renderer specifically for "In Review" POCs
// Always shows ProductBoard button and outcome editing
import { appState } from "./state.js";
import { formatDate, getPucForPoc } from "./helpers.js";
import { renderProductBoardBadges, showProductBoardLinkModal } from "./productboard.js";
import { showFeatureRequestModal } from "./feature_request_modal.js";
import {
  computeUseCaseMetrics,
  renderPocMetrics,
  renderUseCaseDetails,
  attachMetricsListeners
} from "./poc_metrics.js";

console.log('[POC-Card-InReview] VERSION 1.0 - Dedicated In Review card with ProductBoard');

const DAY_MS = 1000 * 60 * 60 * 24;

function parseDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// ---------------------------------------------------------------------
// Get feature requests from cache
// ---------------------------------------------------------------------

function getFeatureRequestsFromCache(pocId) {
  return appState.featureRequestsByPoc?.get(pocId) || [];
}

// ---------------------------------------------------------------------
// Get ProductBoard links from feature requests cache
// ---------------------------------------------------------------------

function getProductBoardLinksFromCache(pocId) {
  const featureRequests = getFeatureRequestsFromCache(pocId);
  if (!featureRequests || featureRequests.length === 0) {
    return [];
  }

  // Transform feature requests into ProductBoard link format for badges
  return featureRequests.map(fr => ({
    feature_name: fr.expand?.feature_request?.title || fr.expand?.feature_request?.name || 'Feature',
    status: fr.expand?.feature_request?.status || 'unknown',
    expand: fr.expand
  }));
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

// ---------------------------------------------------------------------
// Render ONE In Review POC card
// ---------------------------------------------------------------------

export async function renderInReviewPocCard(p) {
  const pocUcs = getPucForPoc(p.id, appState.allPuc) || [];
  const card = document.createElement("div");
  card.className = "poc-card poc-card-in-review";

  const pocStart = parseDate(p.poc_start_date);
  const pocEndPlan = parseDate(p.poc_end_date_plan);
  const lastUpdate = p.last_daily_update_at ? new Date(p.last_daily_update_at) : null;
  const aebValue = p.aeb || p.AEB || "";
  const customerName = p.customer_name || "Unknown Customer";

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

  let pocDurationLabel = "-";
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
      timingIcon = "target";
    } else if (diff > 0.5) {
      closeTimingLabel = "late";
      timingIcon = "warning";
    } else {
      closeTimingLabel = "on time";
      timingIcon = "check";
    }
  }

  const technicalResult = p.technical_result || "unknown";
  const commercialResult = p.commercial_result || "unknown";
  const seComment = p.se_comment || "";

  const currentUser = appState.currentUser;
  const isOwnPoc = currentUser && p.se === currentUser.id;
  const canEditOutcome = currentUser && (
    currentUser.role === "manager" ||
    currentUser.role === "ae" ||
    currentUser.role === "pm" ||
    (currentUser.role === "se" && isOwnPoc)
  );

  // ProductBoard links from cache (not from p.productboard_links)
  const pbLinks = getProductBoardLinksFromCache(p.id);
  const pbBadgesHtml = renderProductBoardBadges(pbLinks);

  // Feature requests from cache
  const featureRequests = getFeatureRequestsFromCache(p.id);
  const erCount = featureRequests.length;

  // ----- HEADER ---------------
  const headerHtml = `
    <div class="poc-header poc-header-improved">
      <div class="poc-header-main">
        <div class="poc-customer-outcome-row">
          <h3 class="poc-customer-name">${customerName}</h3>
          <span class="poc-status-badge risk-at_risk">
            In Review
          </span>
        </div>

        <div class="poc-meta-row">
          ${p.product ? `<span class="poc-meta-item poc-product-tag"><strong>Product:</strong> ${p.product}</span>` : ""}
          ${p.partner ? `<span class="poc-meta-item"><strong>Partner:</strong> ${p.partner}</span>` : ""}
          <span class="poc-meta-item poc-aeb-editable">
            <strong>AEB:</strong>
            <span class="poc-aeb-display">${aebValue ? `$${aebValue}` : "-"}</span>
            ${canEditOutcome ? `<button type="button" class="poc-aeb-edit-btn" title="Edit AEB">*</button>` : ""}
          </span>
          ${pocDurationLabel !== "-" ? `<span class="poc-meta-item"><strong>Duration:</strong> ${pocDurationLabel}${closeTimingLabel ? ` <span class="poc-timing-badge">${timingIcon === "target" ? "T" : timingIcon === "warning" ? "!" : "v"} ${closeTimingLabel}</span>` : ""}</span>` : ""}
        </div>

        ${pbBadgesHtml}
      </div>

      <div class="poc-header-dates-compact">
        <div class="poc-date-compact">
          <span class="poc-date-label">Started</span>
          <span class="poc-date-value">${formatDate(p.poc_start_date) || "-"}</span>
        </div>
        <div class="poc-date-compact">
          <span class="poc-date-label">${actualEndDate ? "Ended" : "Est. End"}</span>
          <span class="poc-date-value">${actualEndDate ? formatDate(actualEndDate) : formatDate(p.poc_end_date_plan) || "-"}</span>
        </div>
      </div>
    </div>
  `;

  // ----- METRICS with ProductBoard button ALWAYS visible ---------------
  const useCaseMetricsHtml = renderPocMetrics({
    completedUc,
    totalUc,
    avgRating,
    feedbackCount,
    erCount,
    showProductBoardBtn: true  // Always show ProductBoard button for In Review
  });

  // Feature request summary
  let frSummaryHtml = '';
  if (featureRequests.length > 0) {
    frSummaryHtml = `
      <div class="fr-summary fr-summary-compact" style="cursor: pointer;">
        <span class="fr-summary-icon">link</span>
        <span class="fr-summary-count">${featureRequests.length} Feature Request${featureRequests.length !== 1 ? 's' : ''}</span>
      </div>
    `;
  }

  // ----- OUTCOME block (editing) --------------------------
  let outcomeHtml = "";

  if (canEditOutcome) {
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
            link ProductBoard
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
  } else {
    // READ-ONLY view for non-authorized users
    outcomeHtml = `
      <div class="poc-outcome-readonly poc-outcome-pending">
        <p class="poc-outcome-pending-text">This POC is awaiting outcome finalization.</p>
      </div>
    `;
  }

  // ----- BODY ------------------------------------
  const bodyHtml = `
    <div class="poc-in-review-body">
      ${useCaseMetricsHtml}
      ${frSummaryHtml}
      ${outcomeHtml}
      ${renderUseCaseDetails(pocUcs, p.id, featureRequests, customerName)}
    </div>
  `;

  card.innerHTML = `
    <div class="poc-card-inner">
      ${headerHtml}
      ${bodyHtml}
    </div>
  `;

  // Create refresh function for this card
  const refreshCard = async () => {
    console.log('[POC-Card-InReview] Refreshing card for POC:', p.id);
    try {
      const newFeatureRequests = await appState.pb
        .collection('poc_feature_requests')
        .getFullList({
          filter: `poc = "${p.id}"`,
          expand: 'feature_request,use_case',
          $autoCancel: false,
        });

      appState.featureRequestsByPoc.set(p.id, newFeatureRequests);

      // Re-render badges
      const newPbLinks = getProductBoardLinksFromCache(p.id);
      const badgesContainer = card.querySelector('.pb-badges');
      if (badgesContainer) {
        badgesContainer.outerHTML = renderProductBoardBadges(newPbLinks);
      } else {
        // Insert badges if they don't exist yet
        const metaRow = card.querySelector('.poc-meta-row');
        if (metaRow && newPbLinks.length > 0) {
          metaRow.insertAdjacentHTML('afterend', renderProductBoardBadges(newPbLinks));
        }
      }

      console.log('[POC-Card-InReview] Card refreshed successfully');
    } catch (error) {
      console.error('[POC-Card-InReview] Failed to refresh card:', error);
    }
  };

  // Attach metrics listeners (toggle button, use case table, etc.)
  attachMetricsListeners(card, p.id, pbLinks, showProductBoardLinkModal, appState.pb, refreshCard);

  // Feature Request button - make summary clickable
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
            aebDisplay.textContent = newValue ? `$${newValue}` : "-";
          } catch (err) {
            console.error("[POC-Card-InReview] Failed to update AEB:", err);
            alert("Failed to update AEB. Please try again.");
          }
        }
      });
    }
  }

  // Outcome editing behaviour
  if (canEditOutcome) {
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
          console.error("[POC-Card-InReview] Failed to save POC changes:", err);
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
          console.error("[POC-Card-InReview] Failed to complete POC:", err);
          if (hintEl) {
            hintEl.textContent = "Completing failed. Please try again.";
            hintEl.style.color = "#d32f2f";
          }
          completeBtn.disabled = false;
          completeBtn.textContent = "Complete POC";
        }
      });
    }

    // ProductBoard button in outcome section
    if (pbBtn) {
      pbBtn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        showProductBoardLinkModal(appState.pb, p.id, null, refreshCard);
      });
    }
  }

  return card;
}
