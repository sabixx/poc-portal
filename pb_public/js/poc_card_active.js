// poc_card_active.js - VERSION v11
// PERFORMANCE OPTIMIZED: Uses pre-loaded cached data instead of per-POC API calls
import { appState } from "./state.js";
import { getPucForPoc, formatDate } from "./helpers.js";
import { showProductBoardLinkModal, renderProductBoardBadges } from "./productboard.js";
import { computeStalledEngagement } from "./poc_status.js";

import { 
  computeUseCaseMetrics, 
  renderPocMetrics, 
  renderUseCaseDetails, 
  attachMetricsListeners 
} from "./poc_metrics.js";

console.log('[POC-Card-Active] VERSION 12.0 - Added remove button for managers/SEs');

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
// Load comments for POC use cases - OPTIMIZED VERSION using cached data
// -----------------------------------------------------------------------------

function loadCommentsForUseCasesFromCache(pocId, pocUseCases) {
  console.log('[POC-Card-Active] Loading comments from cache for POC:', pocId);

  if (!pocUseCases || !pocUseCases.length) {
    console.log('[POC-Card-Active] No use cases provided');
    return [];
  }

  // Get comments from pre-indexed cache
  const pocComments = appState.commentsByPoc?.get(pocId) || [];
  console.log('[POC-Card-Active] Found', pocComments.length, 'cached comments for this POC');

  if (pocComments.length === 0) {
    return [];
  }

  // Attach comments to use cases
  let attachedCount = 0;
  const useCaseIdSet = new Set(pocUseCases.map(puc => puc.id));

  pocUseCases.forEach(puc => {
    // Get comments for this specific use case from cache
    const pucComments = appState.commentsByPuc?.get(puc.id) || [];
    
    if (!puc.expand) puc.expand = {};
    puc.expand.comments = pucComments;

    if (pucComments.length > 0) {
      attachedCount++;

      // Find feedback comment or use latest
      const feedbackComment = pucComments.find(c => c.kind === 'feedback');
      const latestComment = feedbackComment || pucComments[0];
      puc.last_comment_text = latestComment?.text || '';
    }
  });

  console.log('[POC-Card-Active] Attached comments to', attachedCount, 'use cases (from cache)');
  return pocComments;
}

// -----------------------------------------------------------------------------
// Get feature requests from cache
// -----------------------------------------------------------------------------

function getFeatureRequestsFromCache(pocId) {
  return appState.featureRequestsByPoc?.get(pocId) || [];
}

// -----------------------------------------------------------------------------
// Get ProductBoard links from feature requests cache
// -----------------------------------------------------------------------------

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
// Main card renderer - PERFORMANCE OPTIMIZED
// -----------------------------------------------------------------------------

export async function renderActivePocCard(p) {
  console.log('[POC-Card-Active] ====== RENDER START ======');
  console.log('[POC-Card-Active] POC:', p.id, '-', p.customer_name);
  
  const pocUcs = getPucForPoc(p.id, appState.allPuc) || [];
  console.log('[POC-Card-Active] Found', pocUcs.length, 'use cases for this POC');
  
  const card = document.createElement("div");
  card.className = "poc-card poc-card-active";
  card.dataset.pocId = p.id;

  // ---- LOAD COMMENTS FROM CACHE (NO API CALL!) ----
  loadCommentsForUseCasesFromCache(p.id, pocUcs);

  const prepInfo = computePrepReadiness(p, pocUcs);
  const hasCustomerPrep = prepInfo.label !== "none";
  const stalledInfo = computeStalledEngagement(p, pocUcs, getAsOfDate());
  const aebValue = p.aeb || p.AEB || "";
  const pocEndDate = p.poc_end_date_plan || p.poc_end_date;
  const customerName = p.customer_name || "Unknown Customer";

  const statusInfo = computePocStatus(p, pocUcs, prepInfo);

  // Use common metrics module
  const metrics = computeUseCaseMetrics(pocUcs);
  const { totalUc, completedUc, avgRating, feedbackCount } = metrics;

  // ProductBoard links from cache (not from p.productboard_links)
  const pbLinks = getProductBoardLinksFromCache(p.id);
  console.log('[POC-Card-Active] ProductBoard links for POC', p.id, ':', pbLinks);
  const pbBadgesHtml = renderProductBoardBadges(pbLinks);

  // ---- Feature requests FROM CACHE (NO API CALL!) ----
  const featureRequests = getFeatureRequestsFromCache(p.id);
  console.log('[POC-Card-Active] Loaded', featureRequests.length, 'feature requests from cache');

  // Get ER count for the button
  const erCount = featureRequests.length;

  // Check if current user can remove this POC (managers or SE who owns it)
  const currentUser = appState.currentUser;
  const isOwnPoc = currentUser && p.se === currentUser.id;
  const canRemove = currentUser && (
    currentUser.role === "manager" ||
    (currentUser.role === "se" && isOwnPoc)
  );

  // Render metrics HTML with erCount
  const metricsHtml = renderPocMetrics({
    completedUc,
    totalUc,
    avgRating,
    feedbackCount,
    erCount,
    showProductBoardBtn: true,
    showRemoveBtn: canRemove
  });

  // Render COMBINED Use Cases + Feature Requests section
  const useCaseDetailsHtml = renderUseCaseDetails(pocUcs, p.id, featureRequests, customerName);

  card.innerHTML = `
    <div class="poc-card-inner">
      <div class="poc-header poc-header-improved">
        <div class="poc-header-main">
          <div class="poc-customer-status-row">
            <h3 class="poc-customer-name">${customerName}</h3>
            ${statusInfo.pocDeltaLabel ? `
              <span class="poc-status-badge ${statusInfo.pocDeltaClass}">
                🕐 ${statusInfo.pocDeltaLabel}
              </span>
            ` : ""}
          </div>
          
          <div class="poc-meta-row">
            ${p.product ? `<span class="poc-meta-item poc-product-tag"><strong>Product:</strong> ${p.product}</span>` : ""}
            ${p.partner ? `<span class="poc-meta-item"><strong>Partner:</strong> ${p.partner}</span>` : ""}
            <span class="poc-meta-item poc-aeb-editable">
              <strong>AEB:</strong> 
              <span class="poc-aeb-display">${aebValue ? `$${aebValue}` : "–"}</span>
              <button type="button" class="poc-aeb-edit-btn" title="Edit AEB">✎</button>
            </span>
          </div>

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
          
          ${stalledInfo.isStalled ? `
            <div class="poc-prep-banner prep-banner prep-warning">
              <span class="stalled-banner-icon">⚠️</span>
              <div class="stalled-banner-content">
                <span class="stalled-banner-label">No engagement for ${stalledInfo.workdaysSinceActivity} workdays</span>
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

      ${useCaseDetailsHtml}
    </div>
  `;

  // Create refresh function for this card (for when new ERs are linked)
  const refreshCard = async () => {
    console.log('[POC-Card-Active] Refreshing card for POC:', p.id);
    try {
      // Re-fetch feature requests for this specific POC
      const newFeatureRequests = await appState.pb
        .collection('poc_feature_requests')
        .getFullList({
          filter: `poc = "${p.id}"`,
          expand: 'feature_request,use_case',
          $autoCancel: false,
        });
      
      // Update cache
      appState.featureRequestsByPoc.set(p.id, newFeatureRequests);
      
      // Re-render the details section
      const detailsContainer = card.querySelector('.poc-details');
      if (detailsContainer) {
        const { renderActiveUseCaseTable } = await import('./use_case_table.js');
        detailsContainer.innerHTML = renderActiveUseCaseTable(pocUcs, p.id, newFeatureRequests, customerName);
      }
      
      // Update button text
      const toggleBtn = card.querySelector('.poc-toggle-details-btn');
      if (toggleBtn) {
        const newErCount = newFeatureRequests.length;
        toggleBtn.dataset.erCount = newErCount;
        
        const isHidden = detailsContainer?.classList.contains('hidden');
        if (newErCount > 0) {
          toggleBtn.textContent = isHidden ? `Use Cases & Requests (${newErCount})` : "Hide Use Cases & Requests";
          toggleBtn.classList.add('poc-toggle-details-btn--has-ers');
        } else {
          toggleBtn.textContent = isHidden ? "Show Use Case Details" : "Hide Use Case Details";
          toggleBtn.classList.remove('poc-toggle-details-btn--has-ers');
        }
      }
      
      console.log('[POC-Card-Active] Card refreshed successfully');
    } catch (error) {
      console.error('[POC-Card-Active] Failed to refresh card:', error);
    }
  };

  // Attach all metrics listeners using common module, with refresh callback
  attachMetricsListeners(card, p.id, pbLinks, showProductBoardLinkModal, appState.pb, refreshCard);

  // Listen for custom er-linked event (fallback)
  card.addEventListener('er-linked', () => {
    console.log('[POC-Card-Active] er-linked event received');
    refreshCard();
  });

  // Listen for ER toggle event
  card.addEventListener('toggle-ers', async (e) => {
    const showERs = e.detail?.showERs ?? true;
    console.log('[POC-Card-Active] toggle-ers event received:', showERs);
    
    // Re-render details with toggle state
    const detailsContainer = card.querySelector('.poc-details');
    if (detailsContainer) {
      const { renderActiveUseCaseTable } = await import('./use_case_table.js');
      detailsContainer.innerHTML = renderActiveUseCaseTable(pocUcs, p.id, featureRequests, customerName, showERs);
    }
  });

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
          console.error("[POC-Card-Active] Failed to update AEB:", err);
          alert("Failed to update AEB. Please try again.");
        }
      }
    });
  }

  console.log('[POC-Card-Active] ====== RENDER END ======');
  return card;
}