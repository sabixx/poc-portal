// poc_card_active.js - VERSION v8
// With: customer feedback loading, auto-refresh on ER link, event delegation
import { appState } from "./state.js";
import { getPucForPoc, formatDate } from "./helpers.js";
import { showProductBoardLinkModal, renderProductBoardBadges } from "./productboard.js";

import { 
  computeUseCaseMetrics, 
  renderPocMetrics, 
  renderUseCaseDetails, 
  attachMetricsListeners 
} from "./poc_metrics.js";

console.log('[POC-Card-Active] VERSION 9.0 - Direct fetch for comments');

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
// Load comments for POC use cases
// -----------------------------------------------------------------------------

/**
 * REPLACE the loadCommentsForUseCases function in poc_card_active.js (around lines 47-68)
 * with this version that uses direct fetch() instead of PocketBase SDK
 * 
 * VERSION 9.0 - Direct fetch fix for PocketBase 0.34 compatibility
 */

// -----------------------------------------------------------------------------
// Load comments for POC use cases - FIXED VERSION using direct fetch
// -----------------------------------------------------------------------------

async function loadCommentsForUseCases(pb, pocId, pocUseCases) {
  console.log('[POC-Card-Active] === LOADING COMMENTS (FETCH VERSION) ===');
  console.log('[POC-Card-Active] POC ID:', pocId);
  console.log('[POC-Card-Active] POC Use Cases count:', pocUseCases?.length || 0);

  if (!pocUseCases || !pocUseCases.length) {
    console.log('[POC-Card-Active] No use cases provided');
    return [];
  }

  const baseUrl = pb?.baseUrl || 'http://172.17.32.15:8090';

  let headers = { 'Content-Type': 'application/json' };
  if (pb?.authStore?.token) {
    headers['Authorization'] = pb.authStore.token;
  }

  const useCaseIds = pocUseCases.map(puc => puc.id);
  let comments = [];

  try {
    // ─────────────────────────────────────────────
    // Strategy 1: by poc_use_case IDs
    // ─────────────────────────────────────────────
    console.log('[POC-Card-Active] Trying to fetch by poc_use_case IDs:', useCaseIds.length, 'IDs');

    const filterParts = useCaseIds.map(id => `poc_use_case = "${id}"`);
    const filter = filterParts.join(' || ');

    console.log('[POC-Card-Active] Filter (first 200 chars):', filter.substring(0, 200));

    let url = `${baseUrl}/api/collections/comments/records?page=1&perPage=500&filter=${encodeURIComponent(filter)}&sort=-created`;

    let response = await fetch(url, { headers });

    if (response.ok) {
      const data = await response.json();
      comments = data.items || [];
      console.log('[POC-Card-Active] SUCCESS: Loaded', comments.length, 'comments by use case IDs');
    } else {
      console.log('[POC-Card-Active] Filter by poc_use_case failed:', response.status);

      // ─────────────────────────────────────────
      // Strategy 2: by POC ID
      // ─────────────────────────────────────────
      console.log('[POC-Card-Active] Trying to fetch by POC ID:', pocId);

      url = `${baseUrl}/api/collections/comments/records?page=1&perPage=500&filter=${encodeURIComponent(`poc = "${pocId}"`)}&sort=-created`;

      response = await fetch(url, { headers });

      if (response.ok) {
        const data = await response.json();
        comments = data.items || [];
        console.log('[POC-Card-Active] SUCCESS: Loaded', comments.length, 'comments by POC ID');
      } else {
        console.log('[POC-Card-Active] Filter by POC ID failed:', response.status);

        // ─────────────────────────────────────
        // Strategy 3: fetch all + client filter
        // ─────────────────────────────────────
        console.log('[POC-Card-Active] Trying to fetch all comments...');

        url = `${baseUrl}/api/collections/comments/records?page=1&perPage=500&sort=-created`;

        response = await fetch(url, { headers });

        if (response.ok) {
          const data = await response.json();
          const all = data.items || [];
          console.log('[POC-Card-Active] Fetched', all.length, 'total comments');

          const useCaseIdSet = new Set(useCaseIds);
          comments = all.filter(comment =>
            useCaseIdSet.has(comment.poc_use_case) || comment.poc === pocId
          );

          console.log('[POC-Card-Active] After client-side filtering:', comments.length, 'comments for this POC');
        } else {
          console.log('[POC-Card-Active] Failed to fetch all comments:', response.status);
          comments = [];
        }
      }
    }

    if (!comments.length) {
      console.log('[POC-Card-Active] No comments found for this POC');
      return [];
    }

    // Debug first comment
    console.log('[POC-Card-Active] First comment:', JSON.stringify(comments[0], null, 2));

    // ─────────────────────────────────────────────
    // Group comments by poc_use_case
    // (handles single relation or multi-rel)
    // ─────────────────────────────────────────────
    const commentsByPuc = {};
    const useCaseIdSet = new Set(useCaseIds);

    comments.forEach(comment => {
      const raw = comment.poc_use_case;

      if (Array.isArray(raw)) {
        raw.forEach(id => {
          if (!id || !useCaseIdSet.has(id)) return;
          if (!commentsByPuc[id]) commentsByPuc[id] = [];
          commentsByPuc[id].push(comment);
          console.log(
            '[POC-Card-Active] Comment for PUC (array):',
            id,
            '- text:',
            comment.text?.substring(0, 40)
          );
        });
      } else if (raw && useCaseIdSet.has(raw)) {
        if (!commentsByPuc[raw]) commentsByPuc[raw] = [];
        commentsByPuc[raw].push(comment);
        console.log(
          '[POC-Card-Active] Comment for PUC (single):',
          raw,
          '- text:',
          comment.text?.substring(0, 40)
        );
      } else if (!raw && comment.poc === pocId) {
        // POC-level comments – optional: could be stored under a special key
        console.log('[POC-Card-Active] Comment is POC-level only:', comment.id);
      } else {
        // Not relevant for these use cases
      }
    });

    console.log(
      '[POC-Card-Active] Grouped comments by PUC IDs:',
      Object.keys(commentsByPuc)
    );

    // ─────────────────────────────────────────────
    // Attach comments to the use cases
    // ─────────────────────────────────────────────
    let attachedCount = 0;

    pocUseCases.forEach(puc => {
      const pucComments = commentsByPuc[puc.id] || [];
      if (!puc.expand) puc.expand = {};
      puc.expand.comments = pucComments;

      if (pucComments.length > 0) {
        attachedCount++;

        // Comments are sorted -created, so index 0 is newest
        const feedbackComment = pucComments.find(c => c.kind === 'feedback');
        const latestComment = feedbackComment || pucComments[0];

        puc.last_comment_text = latestComment?.text || '';

        console.log(
          '[POC-Card-Active] ✓ Attached',
          pucComments.length,
          'comments to:',
          puc.expand?.use_case?.title || puc.id,
          '- Text:',
          (puc.last_comment_text || '').substring(0, 30)
        );
      }
    });

    console.log(
      '[POC-Card-Active] === COMMENTS LOADED ===',
      attachedCount,
      'use cases have comments'
    );

    return comments;

  } catch (error) {
    console.error('[POC-Card-Active] Error loading comments:', error);
    return [];
  }
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
// Main card renderer - COMBINED Use Cases + Feature Requests
// -----------------------------------------------------------------------------

export async function renderActivePocCard(p) {
  console.log('[POC-Card-Active] ====== RENDER START ======');
  console.log('[POC-Card-Active] POC:', p.id, '-', p.customer_name);
  
  const pocUcs = getPucForPoc(p.id, appState.allPuc) || [];
  console.log('[POC-Card-Active] Found', pocUcs.length, 'use cases for this POC');
  
  const card = document.createElement("div");
  card.className = "poc-card poc-card-active";
  card.dataset.pocId = p.id;

  // ---- LOAD COMMENTS ----
  console.log('[POC-Card-Active] Checking appState.pb:', !!appState.pb);
  if (appState.pb) {
    console.log('[POC-Card-Active] Calling loadCommentsForUseCases...');
    await loadCommentsForUseCases(appState.pb, p.id, pocUcs);
    console.log('[POC-Card-Active] loadCommentsForUseCases completed');
  } else {
    console.log('[POC-Card-Active] WARNING: appState.pb is not available!');
  }

  const prepInfo = computePrepReadiness(p, pocUcs);
  const hasCustomerPrep = prepInfo.label !== "none";
  const aebValue = p.aeb || p.AEB || "";
  const pocEndDate = p.poc_end_date_plan || p.poc_end_date;
  const customerName = p.customer_name || "Unknown Customer";

  const statusInfo = computePocStatus(p, pocUcs, prepInfo);

  // Use common metrics module
  const metrics = computeUseCaseMetrics(pocUcs);
  const { totalUc, completedUc, avgRating, feedbackCount } = metrics;

  // ProductBoard links
  const pbLinks = p.productboard_links || [];
  const pbBadgesHtml = renderProductBoardBadges(pbLinks);

  // ---- Feature requests for this POC ----
  let featureRequests = [];

  try {
    if (appState.pb) {
      featureRequests = await appState.pb
        .collection('poc_feature_requests')
        .getFullList({
          filter: `poc = "${p.id}"`,
          expand: 'feature_request,use_case',
          $autoCancel: false,
        });
      console.log('[POC-Card-Active] Loaded', featureRequests.length, 'feature requests');
    }
  } catch (error) {
    console.error('[POC-Card-Active] Failed to load feature requests:', error);
  }

  // Get ER count for the button
  const erCount = featureRequests.length;

  // Render metrics HTML with erCount
  const metricsHtml = renderPocMetrics({
    completedUc,
    totalUc,
    avgRating,
    feedbackCount,
    erCount,
    showProductBoardBtn: true
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

      ${useCaseDetailsHtml}
    </div>
  `;

  // Create refresh function for this card
  const refreshCard = async () => {
    console.log('[POC-Card-Active] Refreshing card for POC:', p.id);
    try {
      // Re-fetch feature requests
      const newFeatureRequests = await appState.pb
        .collection('poc_feature_requests')
        .getFullList({
          filter: `poc = "${p.id}"`,
          expand: 'feature_request,use_case',
          $autoCancel: false,
        });
      
      // Re-fetch comments
      await loadCommentsForUseCases(appState.pb, p.id, pocUcs);
      
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