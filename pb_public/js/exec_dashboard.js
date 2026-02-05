// exec_dashboard.js - Executive Dashboard Main Module
// VERSION 2.0 - Revenue-weighted ER analytics with Lucide icons

import { appState } from "./state.js";
import { categorizePoc } from "./poc_status.js";
import {
  loadFilterState,
  setExecFilterChangeCallback,
  extractFilterOptions,
  applyExecFilters,
  renderExecFilterBar,
  renderSavedViewsBar,
  getExecFilterState,
  getTopNToggle,
  setTopNToggle,
  isOpenPoc,
  isClosedPoc,
  getPocStatusLabel,
} from "./exec_filters.js";
import { renderERDrilldown, renderSummaryDrilldown, hideDrilldown } from "./exec_drilldown.js";

console.log("[ExecDashboard] VERSION 2.0 - Executive dashboard initialized");

// DOM elements
let filterBarEl = null;
let savedViewsEl = null;
let summaryEl = null;
let topERsEl = null;
let drilldownEl = null;

// State
let currentFilteredPocs = [];
let currentERsData = [];
let pocUseCasesMap = new Map();

/**
 * Parse AEB value to number
 */
function parseAEB(aebValue) {
  if (!aebValue) return 0;
  const cleaned = String(aebValue).replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Format AEB for display (with commas, no decimals)
 */
function formatAEB(num) {
  if (num === 0) return '0';
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Initialize the executive dashboard
 */
export function initExecDashboard() {
  console.log("[ExecDashboard] Initializing...");

  // Get DOM elements
  filterBarEl = document.getElementById('exec-filter-bar');
  savedViewsEl = document.getElementById('exec-saved-views');
  summaryEl = document.getElementById('exec-summary');
  topERsEl = document.getElementById('exec-top-ers');
  drilldownEl = document.getElementById('exec-drilldown');

  if (!filterBarEl || !summaryEl || !topERsEl) {
    console.error("[ExecDashboard] Required DOM elements not found");
    return;
  }

  // Initialize Lucide icons for static elements (back button)
  const execSection = document.getElementById('exec-dashboard-section');
  if (window.lucide && execSection) {
    lucide.createIcons();
  }

  // Build POC use cases map from appState
  pocUseCasesMap.clear();
  appState.allPuc.forEach(puc => {
    const pocId = puc.poc;
    if (!pocUseCasesMap.has(pocId)) {
      pocUseCasesMap.set(pocId, []);
    }
    pocUseCasesMap.get(pocId).push(puc);
  });
  console.log("[ExecDashboard] Built POC use cases map:", pocUseCasesMap.size, "POCs with use cases");

  // Load saved filter state
  loadFilterState();

  // Set up filter change callback
  setExecFilterChangeCallback(() => {
    renderDashboard();
  });

  // Render initial view
  renderDashboard();
}

/**
 * Main render function
 */
function renderDashboard() {
  console.log("[ExecDashboard] Rendering dashboard...");

  const pocs = appState.allPocs || [];
  const users = appState.allUsers || [];
  const featureRequestsByPoc = appState.featureRequestsByPoc || new Map();
  const asOfDate = new Date();

  console.log("[ExecDashboard] Data summary:", {
    pocsCount: pocs.length,
    usersCount: users.length,
    featureRequestsMapSize: featureRequestsByPoc.size,
  });

  // Debug: Check for deal breakers in the raw data
  let totalFRs = 0;
  let dealBreakerFRs = 0;
  featureRequestsByPoc.forEach((frs, pocId) => {
    frs.forEach(fr => {
      totalFRs++;
      // Handle both boolean and string "true"
      const isDealBreaker = fr.is_deal_breaker === true || fr.is_deal_breaker === "true";
      if (isDealBreaker) {
        dealBreakerFRs++;
        if (dealBreakerFRs <= 2) {
          console.log("[ExecDashboard] Sample deal breaker FR:", { pocId, is_deal_breaker: fr.is_deal_breaker, type: typeof fr.is_deal_breaker, fr_id: fr.id });
        }
      }
    });
  });
  console.log("[ExecDashboard] Feature requests:", totalFRs, "total,", dealBreakerFRs, "deal breakers");

  // Extract filter options
  // Collect all poc_feature_requests with expanded feature_request
  const allPocFeatureRequests = [];
  featureRequestsByPoc.forEach((frs, pocId) => {
    frs.forEach(fr => {
      allPocFeatureRequests.push({
        ...fr,
        poc: pocId,
      });
    });
  });

  const filterOptions = extractFilterOptions(pocs, allPocFeatureRequests, users);

  // Render filter bar
  if (filterBarEl) {
    renderExecFilterBar(filterBarEl, filterOptions);
  }

  // Render saved views bar
  if (savedViewsEl) {
    renderSavedViewsBar(savedViewsEl);
  }

  // Apply filters
  currentFilteredPocs = applyExecFilters(pocs, featureRequestsByPoc, users, pocUseCasesMap, asOfDate);

  // Compute and render summary
  const summaryData = computeSummary(pocs, currentFilteredPocs, featureRequestsByPoc, users, asOfDate);
  renderSummary(summaryData, users, asOfDate);

  // Compute and render top ERs
  currentERsData = aggregateERsByAEB(currentFilteredPocs, featureRequestsByPoc, users, asOfDate);
  renderTopERs(currentERsData, filterOptions.ers);

  // Hide drill-down
  if (drilldownEl) {
    hideDrilldown(drilldownEl);
  }
}

/**
 * Compute summary metrics
 */
function computeSummary(allPocs, filteredPocs, featureRequestsByPoc, users, asOfDate) {
  const filterState = getExecFilterState();

  // Total AEB in scope (filtered)
  let totalAEB = 0;
  let openAEB = 0;
  let closedAEB = 0;

  filteredPocs.forEach(p => {
    const aeb = parseAEB(p.aeb);
    totalAEB += aeb;

    if (isOpenPoc(p, pocUseCasesMap, asOfDate)) {
      openAEB += aeb;
    } else if (isClosedPoc(p, pocUseCasesMap, asOfDate)) {
      closedAEB += aeb;
    }
  });

  // Open AEB impacted by selected ERs (only if ERs are selected)
  let openAEBWithSelectedERs = 0;
  const selectedERIds = filterState.selectedERs;

  if (selectedERIds.size > 0) {
    filteredPocs.forEach(p => {
      if (!isOpenPoc(p, pocUseCasesMap, asOfDate)) return;

      const pocFRs = featureRequestsByPoc.get(p.id) || [];
      const hasMatchingER = pocFRs.some(fr => selectedERIds.has(fr.feature_request));
      if (hasMatchingER) {
        openAEBWithSelectedERs += parseAEB(p.aeb);
      }
    });
  }

  return {
    totalAEB,
    openAEB,
    closedAEB,
    openAEBWithSelectedERs,
    hasSelectedERs: selectedERIds.size > 0,
    filteredCount: filteredPocs.length,
    totalCount: allPocs.length,
  };
}

/**
 * Render summary section
 */
function renderSummary(data, users, asOfDate) {
  if (!summaryEl) return;

  summaryEl.innerHTML = `
    <div class="exec-summary-grid">
      <div class="exec-summary-card clickable" data-metric="total">
        <div class="exec-summary-icon" style="background: rgba(30,64,175,0.1); color: #1e40af;">
          <i data-lucide="dollar-sign"></i>
        </div>
        <div class="exec-summary-info">
          <span class="exec-summary-label">Total AEB in Scope</span>
          <span class="exec-summary-value money">${formatAEB(data.totalAEB)}</span>
        </div>
      </div>
      <div class="exec-summary-card open clickable" data-metric="open">
        <div class="exec-summary-icon" style="background: rgba(34,197,94,0.1); color: #22c55e;">
          <i data-lucide="trending-up"></i>
        </div>
        <div class="exec-summary-info">
          <span class="exec-summary-label">Open AEB</span>
          <span class="exec-summary-value money">${formatAEB(data.openAEB)}</span>
        </div>
      </div>
      <div class="exec-summary-card closed clickable" data-metric="closed">
        <div class="exec-summary-icon" style="background: rgba(59,130,246,0.1); color: #3b82f6;">
          <i data-lucide="archive"></i>
        </div>
        <div class="exec-summary-info">
          <span class="exec-summary-label">Closed AEB</span>
          <span class="exec-summary-value money">${formatAEB(data.closedAEB)}</span>
        </div>
      </div>
      ${data.hasSelectedERs ? `
        <div class="exec-summary-card impacted clickable" data-metric="impacted">
          <div class="exec-summary-icon" style="background: rgba(245,158,11,0.1); color: #f59e0b;">
            <i data-lucide="target"></i>
          </div>
          <div class="exec-summary-info">
            <span class="exec-summary-label">Open AEB (Selected ERs)</span>
            <span class="exec-summary-value money">${formatAEB(data.openAEBWithSelectedERs)}</span>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  // Render Lucide icons in summary cards
  if (window.lucide) lucide.createIcons();

  // Attach click handlers for drill-down
  summaryEl.querySelectorAll('.exec-summary-card.clickable').forEach(card => {
    card.addEventListener('click', () => {
      const metric = card.dataset.metric;
      handleSummaryClick(metric, users, asOfDate);
    });
  });
}

/**
 * Handle summary card click for drill-down
 */
function handleSummaryClick(metric, users, asOfDate) {
  if (!drilldownEl) return;

  const featureRequestsByPoc = appState.featureRequestsByPoc || new Map();
  const filterState = getExecFilterState();

  // Build user region map
  const userRegionMap = new Map();
  users.forEach(u => {
    if (u.region) userRegionMap.set(u.id, u.region);
  });

  // Build POCs with details for drill-down
  let pocsToShow = [];
  let title = '';

  switch (metric) {
    case 'total':
      title = 'All POCs in Scope';
      pocsToShow = currentFilteredPocs;
      break;
    case 'open':
      title = 'Open POCs';
      pocsToShow = currentFilteredPocs.filter(p => isOpenPoc(p, pocUseCasesMap, asOfDate));
      break;
    case 'closed':
      title = 'Closed POCs';
      pocsToShow = currentFilteredPocs.filter(p => isClosedPoc(p, pocUseCasesMap, asOfDate));
      break;
    case 'impacted':
      title = 'Open POCs with Selected ERs';
      const selectedERIds = filterState.selectedERs;
      pocsToShow = currentFilteredPocs.filter(p => {
        if (!isOpenPoc(p, pocUseCasesMap, asOfDate)) return false;
        const pocFRs = featureRequestsByPoc.get(p.id) || [];
        return pocFRs.some(fr => selectedERIds.has(fr.feature_request));
      });
      break;
  }

  // Build detail data for each POC
  const pocsWithDetails = pocsToShow.map(p => {
    const pocFRs = featureRequestsByPoc.get(p.id) || [];
    const ers = pocFRs.map(fr => ({
      title: fr.expand?.feature_request?.title || 'Unknown ER',
      // Handle both boolean and string "true" for is_deal_breaker
      isDealBreaker: fr.is_deal_breaker === true || fr.is_deal_breaker === "true",
      importance: fr.importance,
    }));

    return {
      poc: p,
      region: userRegionMap.get(p.se) || '-',
      pocStatus: getPocStatusLabel(p, pocUseCasesMap, asOfDate),
      commercialResult: p.commercial_result || 'unknown',
      ers,
    };
  });

  renderSummaryDrilldown(drilldownEl, title, pocsWithDetails, () => {
    // Deselect any selected ER rows
    topERsEl?.querySelectorAll('tr.selected').forEach(row => row.classList.remove('selected'));
  });
}

/**
 * Aggregate ERs by total AEB
 */
function aggregateERsByAEB(filteredPocs, featureRequestsByPoc, users, asOfDate) {
  const filterState = getExecFilterState();
  const dealBreakerMode = filterState.dealBreakerMode;

  // Build user region map
  const userRegionMap = new Map();
  users.forEach(u => {
    if (u.region) userRegionMap.set(u.id, u.region);
  });

  // Map: erId -> { er, totalAEB, customers: [...], products: Set }
  const erMap = new Map();

  filteredPocs.forEach(p => {
    const pocFRs = featureRequestsByPoc.get(p.id) || [];
    const pocAEB = parseAEB(p.aeb);
    const pocStatus = getPocStatusLabel(p, pocUseCasesMap, asOfDate);
    const region = userRegionMap.get(p.se) || '-';
    const needsByDate = p.poc_end_date_plan || p.poc_end_date || null;

    pocFRs.forEach(pfr => {
      const er = pfr.expand?.feature_request;
      if (!er) return;

      // Handle both boolean and string "true" for is_deal_breaker
      const isDealBreaker = pfr.is_deal_breaker === true || pfr.is_deal_breaker === "true";

      // When dealBreakerMode is 'only', skip non-blocker ER-POC pairs
      if (dealBreakerMode === 'only' && !isDealBreaker) {
        return; // Skip this ER for this POC - it's not a blocker
      }

      const erId = er.id;

      if (!erMap.has(erId)) {
        erMap.set(erId, {
          er: { id: er.id, title: er.title, product: er.product },
          totalAEB: 0,
          customers: [],
          products: new Set(),
        });
      }

      const entry = erMap.get(erId);
      entry.totalAEB += pocAEB;
      entry.customers.push({
        customerName: p.customer_name || 'Unknown',
        aeb: p.aeb,
        pocStatus,
        isDealBreaker: isDealBreaker,
        region,
        importance: pfr.importance || 'nice_to_have',
        pocId: p.id,
        commercialResult: p.commercial_result || 'unknown',
        needsByDate: needsByDate,
      });

      if (p.product) {
        entry.products.add(p.product);
      }
    });
  });

  // Convert to array and sort by total AEB descending
  const ersArray = Array.from(erMap.values())
    .sort((a, b) => b.totalAEB - a.totalAEB);

  return ersArray;
}

/**
 * Get AEB color class based on POC commercial result
 * Orange for at-risk (missing features, not won), Green for won
 */
function getAEBColorClass(commercialResult) {
  if (commercialResult === 'now_customer') {
    return 'aeb-won';  // green - customer won
  }
  return 'aeb-at-risk';  // orange - missing features, at risk
}

/**
 * Calculate won vs at-risk AEB for an ER
 */
function calculateAEBBreakdown(customers) {
  let wonAEB = 0;
  let atRiskAEB = 0;

  customers.forEach(c => {
    const aeb = parseAEB(c.aeb);
    if (c.commercialResult === 'now_customer') {
      wonAEB += aeb;
    } else {
      atRiskAEB += aeb;
    }
  });

  return { wonAEB, atRiskAEB };
}

/**
 * Render Top ERs table
 */
function renderTopERs(ersData, allEROptions) {
  if (!topERsEl) return;

  const topN = getTopNToggle();
  const topERs = ersData.slice(0, topN);

  topERsEl.innerHTML = `
    <div class="exec-top-ers-header">
      <h3 class="exec-top-ers-title">Top ERs by AEB</h3>
      <div class="exec-top-n-toggle">
        <button type="button" class="exec-top-n-btn ${topN === 5 ? 'active' : ''}" data-n="5">Top 5</button>
        <button type="button" class="exec-top-n-btn ${topN === 10 ? 'active' : ''}" data-n="10">Top 10</button>
      </div>
    </div>
    ${topERs.length > 0 ? `
      <table class="exec-ers-table">
        <thead>
          <tr>
            <th>#</th>
            <th>ER</th>
            <th>Total AEB</th>
            <th>POCs</th>
            <th>Products</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${topERs.map((erData, idx) => {
            const { wonAEB, atRiskAEB } = calculateAEBBreakdown(erData.customers);
            // Show total in orange if there's any at-risk AEB, green only if all won
            const totalColorClass = atRiskAEB > 0 ? 'aeb-at-risk' : 'aeb-won';
            return `
            <tr data-er-id="${erData.er.id}">
              <td class="exec-er-rank"><span class="exec-er-rank-badge">${idx + 1}</span></td>
              <td class="exec-er-title" title="${escapeHtml(erData.er.title)}">${escapeHtml(truncate(erData.er.title, 60))}</td>
              <td class="exec-er-aeb ${totalColorClass}">${formatAEB(erData.totalAEB)}</td>
              <td class="exec-er-count">${erData.customers.length}</td>
              <td class="exec-er-product">${Array.from(erData.products).slice(0, 2).join(', ')}${erData.products.size > 2 ? '...' : ''}</td>
              <td class="exec-er-expand"><i data-lucide="chevron-right"></i></td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    ` : `
      <div class="exec-no-data">
        <div class="exec-no-data-icon"><i data-lucide="bar-chart-3" style="width:32px;height:32px;"></i></div>
        <div>No ERs found for the current filters</div>
      </div>
    `}
  `;

  // Render Lucide icons
  if (window.lucide) lucide.createIcons();

  // Attach toggle handlers
  topERsEl.querySelectorAll('.exec-top-n-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = parseInt(btn.dataset.n);
      setTopNToggle(n);
    });
  });

  // Attach row click handlers for drill-down
  topERsEl.querySelectorAll('.exec-ers-table tbody tr').forEach(row => {
    row.addEventListener('click', () => {
      const erId = row.dataset.erId;
      const erData = ersData.find(e => e.er.id === erId);
      if (erData) {
        // Mark row as selected
        topERsEl.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');

        renderERDrilldown(drilldownEl, erData, () => {
          row.classList.remove('selected');
        });
      }
    });
  });
}

/**
 * Escape HTML
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Truncate string
 */
function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '...';
}

/**
 * Refresh the dashboard (public method)
 */
export function refreshExecDashboard() {
  renderDashboard();
}
