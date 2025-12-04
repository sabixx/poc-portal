// poc_card_active.js - IMPROVED VERSION v4 with common metrics module and Feature Requests
import { appState } from "./state.js";
import { getPucForPoc, formatDate } from "./helpers.js";
import { showProductBoardLinkModal, renderProductBoardBadges } from "./productboard.js";

import { showFeatureRequestModal } from "./feature_request_modal.js";
import { 
  renderFeatureRequestSummary,
  renderFeatureRequestsTable,
  attachFeatureRequestListeners
} from "./feature_request_table.js";

import { 
  computeUseCaseMetrics, 
  renderPocMetrics, 
  renderUseCaseDetails, 
  attachMetricsListeners 
} from "./poc_metrics.js";


// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

const HOURS_PER_DAY = 8;

function getAsOfDate() {
  const d = appState.asOfDate ? new Date(appState.asOfDate) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function workingDaysBetween(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  if (e < s) return 0;

  let days = 0;
  const d = new Date(s);
  while (d <= e) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) days++;
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// -----------------------------------------------------------------------------
// Prep readiness logic
// -----------------------------------------------------------------------------

function computePrepReadiness(p, pocUcs) {
  const pocStart = p.poc_start_date ? new Date(p.poc_start_date) : null;
  if (!pocStart || Number.isNaN(pocStart.getTime())) {
    return { label: "n/a", remaining: 0, capacity: 0, daysLeft: 0, outstandingCount: 0 };
  }

  const asOf = getAsOfDate();

  let remainingHours = 0;
  let hasPrep = false;
  let outstandingCount = 0;

  (pocUcs || []).forEach((puc) => {
    const uc = puc.expand && puc.expand.use_case;
    if (!uc || !uc.is_customer_prep) return;
    hasPrep = true;

    if (puc.is_completed) return;

    outstandingCount++;

    const est =
      typeof uc.estimate_hours === "number"
        ? uc.estimate_hours
        : typeof puc.estimate_hours === "number"
        ? puc.estimate_hours
        : 0;

    remainingHours += est;
  });

  if (!hasPrep) {
    return { label: "none", remaining: 0, capacity: 0, daysLeft: 0, outstandingCount: 0 };
  }

  const daysLeft = workingDaysBetween(asOf, pocStart);
  const capacity = Math.max(0, daysLeft * HOURS_PER_DAY);

  if (remainingHours <= 0) {
    return { label: "ready", remaining: 0, capacity, daysLeft, outstandingCount };
  }

  if (daysLeft <= 0 || capacity <= 0) {
    return { label: "overdue", remaining: remainingHours, capacity, daysLeft, outstandingCount };
  }

  const label = remainingHours > capacity ? "at risk" : "in time";
  return { label, remaining: remainingHours, capacity, daysLeft, outstandingCount };
}

function prepBadgeClass(info) {
  switch (info.label) {
    case "ready":
    case "in time":
      return "prep-badge prep-ok";
    case "at risk":
      return "prep-badge prep-warning";
    case "overdue":
      return "prep-badge prep-danger";
    case "none":
    default:
      return "prep-badge prep-na";
  }
}

// -----------------------------------------------------------------------------
// POC status logic
// -----------------------------------------------------------------------------

function computePocStatus(p, pocUcs, prepInfo) {
  const asOf = getAsOfDate();
  const pocEndDate = p.poc_end_date_plan || p.poc_end_date;
  const endDt = pocEndDate ? new Date(pocEndDate) : null;

  let total = 0;
  let done = 0;
  let latestCompletedAt = null;

  (pocUcs || []).forEach((puc) => {
    const uc = puc.expand && puc.expand.use_case;
    if (!uc) return;
    if (!puc.is_active && !puc.is_completed) return;

    total++;
    if (puc.is_completed) {
      done++;
      if (puc.completed_at) {
        const c = new Date(puc.completed_at);
        if (!Number.isNaN(c.getTime())) {
          if (!latestCompletedAt || c > latestCompletedAt) {
            latestCompletedAt = c;
          }
        }
      }
    }
  });

  const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;

  let pocDeltaLabel = "";
  let pocDeltaClass = "";
  if (endDt && !Number.isNaN(endDt.getTime())) {
    if (asOf > endDt) {
      const daysOver = workingDaysBetween(endDt, asOf);
      pocDeltaLabel = `${daysOver} day${daysOver === 1 ? "" : "s"} overdue`;
      pocDeltaClass = "poc-delta-overdue";
    } else if (asOf < endDt) {
      const daysLeft = workingDaysBetween(asOf, endDt);
      pocDeltaLabel = `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
      pocDeltaClass = daysLeft <= 3 ? "poc-delta-warning" : "poc-delta-ok";
    }
  }

  let statusText = "on track";
  let statusClass = "risk-on_track";

  if (total > 0 && done === total) {
    if (endDt && latestCompletedAt && latestCompletedAt > endDt) {
      statusText = "completed*";
      statusClass = "risk-on_track";
    } else {
      statusText = "completed";
      statusClass = "risk-on_track";
    }
  } else {
    if (endDt && asOf > endDt) {
      statusText = "overdue";
      statusClass = "risk-overdue";
    } else if (
      prepInfo &&
      (prepInfo.label === "at risk" || prepInfo.label === "overdue")
    ) {
      statusText = "at risk";
      statusClass = "risk-at_risk";
    } else {
      statusText = "on track";
      statusClass = "risk-on_track";
    }
  }

  return {
    totalUseCases: total,
    completedUseCases: done,
    completionPct,
    pocDeltaLabel,
    pocDeltaClass,
    statusText,
    statusClass,
  };
}

// -----------------------------------------------------------------------------
// Main card renderer - IMPROVED LAYOUT v4 with common metrics module and FRs
// -----------------------------------------------------------------------------

export async function renderActivePocCard(p) {
  const pocUcs = getPucForPoc(p.id, appState.allPuc) || [];
  const card = document.createElement("div");
  card.className = "poc-card poc-card-active";

  const prepInfo = computePrepReadiness(p, pocUcs);
  const hasCustomerPrep = prepInfo.label !== "none";
  const aebValue = p.aeb || p.AEB || "";
  const pocEndDate = p.poc_end_date_plan || p.poc_end_date;

  const statusInfo = computePocStatus(p, pocUcs, prepInfo);

  // Use common metrics module
  const metrics = computeUseCaseMetrics(pocUcs);
  const { totalUc, completedUc, avgRating, feedbackCount } = metrics;

  // ProductBoard links
  const pbLinks = p.productboard_links || [];
  const pbBadgesHtml = renderProductBoardBadges(pbLinks);

  // Render metrics HTML using common module
  const metricsHtml = renderPocMetrics({
    completedUc,
    totalUc,
    avgRating,
    feedbackCount,
    showProductBoardBtn: true
  });

  // ---- Feature requests for this POC (summary + table) ----
  let featureRequests = [];
  let frSummaryHtml = '';
  let frTableHtml = '';

  try {
    if (appState.pb) {
      featureRequests = await appState.pb
        .collection('poc_feature_requests')
        .getFullList({
          filter: `poc = "${p.id}"`,
          expand: 'feature_request,use_case',
          $autoCancel: false,
        });

      frSummaryHtml = renderFeatureRequestSummary(featureRequests.length);
      frTableHtml = renderFeatureRequestsTable(featureRequests, p.id);
    }
  } catch (error) {
    console.error('[ActivePOC] Failed to load feature requests:', error);
  }

  const featureRequestsSectionHtml = featureRequests.length
    ? `<div class="poc-feature-requests-section">
         ${frSummaryHtml}
         ${frTableHtml}
       </div>`
    : '';

  card.innerHTML = `
    <div class="poc-card-inner">
      <div class="poc-header poc-header-improved">
        <div class="poc-header-main">
          <div class="poc-customer-status-row">
            <h3 class="poc-customer-name">${p.customer_name || "Unknown Customer"}</h3>
            ${statusInfo.pocDeltaLabel ? `
              <span class="poc-status-badge ${statusInfo.pocDeltaClass}">
                🕐 ${statusInfo.pocDeltaLabel}
              </span>
            ` : ""}
          </div>
          
          <div class="poc-meta-row">
            ${p.partner ? `<span class="poc-meta-item"><strong>Partner:</strong> ${p.partner}</span>` : ""}
            <span class="poc-meta-item poc-aeb-editable">
              <strong>AEB:</strong> 
              <span class="poc-aeb-display">${aebValue ? `$${aebValue}` : "–"}</span>
              <button type="button" class="poc-aeb-edit-btn" title="Edit AEB">✎</button>
            </span>
          </div>

          ${pbBadgesHtml}

          ${hasCustomerPrep ? `
            <div class="poc-prep-banner ${prepBadgeClass(prepInfo).replace('prep-badge', 'prep-banner')}">
              <span class="prep-banner-icon">🎯</span>
              <div class="prep-banner-content">
                <span class="prep-banner-label">Customer prep: <strong>${prepInfo.label}</strong></span>
                ${prepInfo.outstandingCount > 0 || prepInfo.daysLeft >= 0 ? `
                  <span class="prep-banner-detail">
                    ${prepInfo.outstandingCount} step${prepInfo.outstandingCount === 1 ? '' : 's'} outstanding${prepInfo.daysLeft > 0 ? ` · ${prepInfo.daysLeft} working day${prepInfo.daysLeft === 1 ? '' : 's'} until start` : prepInfo.daysLeft === 0 ? ' · starts today' : ''}
                  </span>
                ` : ""}
              </div>
            </div>
          ` : ""}
        </div>
        
        <div class="poc-header-dates-compact">
          <div class="poc-date-compact">
            <span class="poc-date-label">Start</span>
            <span class="poc-date-value">${formatDate(p.poc_start_date) || "–"}</span>
          </div>
          <div class="poc-date-compact">
            <span class="poc-date-label">End</span>
            <span class="poc-date-value">${formatDate(pocEndDate) || "–"}</span>
          </div>
        </div>
      </div>

      ${metricsHtml}

      ${featureRequestsSectionHtml}

      ${renderUseCaseDetails(pocUcs, p.id)}
    </div>
  `;

  // Attach all metrics listeners using common module
  attachMetricsListeners(card, p.id, pbLinks, showProductBoardLinkModal, appState.pb);

  // Feature Requests table listeners
  attachFeatureRequestListeners(card);

  // Feature Request button (summary click opens modal)
  const frBtn = card.querySelector('.fr-summary');
  if (frBtn) {
    frBtn.style.cursor = 'pointer';
    frBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      showFeatureRequestModal({ pocId: p.id });
    });
  }

  // AEB editing
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

  return card;
}
