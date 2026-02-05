// dashboard.js - Dashboard metrics display with view categories
// VERSION 4.0 - Lucide icons, compact cards, enhanced UX
import { computeDashboardMetrics, categorizePoc } from "./poc_status.js";
import { toggleStatusFilter, isStatusFiltered, refreshFilterSummary, setViewCategory, getViewCategory } from "./filters.js";

console.log("[Dashboard] VERSION 4.0 - Lucide icons + enhanced UX");

/** Map status IDs to Lucide icon names */
const STATUS_ICONS = {
  'on_track': 'circle-check-big',
  'at_risk': 'triangle-alert',
  'at_risk_prep': 'target',
  'at_risk_stalled': 'circle-pause',
  'overdue': 'circle-x',
  'this_month': 'calendar',
  'next_month': 'calendar-days'
};

/**
 * Render the dashboard with all metrics
 * @param {Array} baseFilteredPocs - POCs filtered by SE/region/product/search but NOT by view category
 * @param {Array} allPocs - ALL POCs (for total count)
 * @param {Map} pocUseCasesMap - Map of POC ID to use cases
 * @param {Date} asOfDate - Date for status calculations
 */
export function renderDashboard(baseFilteredPocs, allPocs, pocUseCasesMap, asOfDate) {
  const container = document.getElementById("dashboard-section");
  if (!container) return;

  const pocs = baseFilteredPocs || [];

  // Count POCs by category
  let activeCount = 0;
  let inReviewCount = 0;
  let completedCount = 0;

  pocs.forEach(p => {
    const pocUcs = pocUseCasesMap.get(p.id) || [];
    const categorized = categorizePoc(p, pocUcs, asOfDate);

    if (categorized.isActive) activeCount++;
    else if (categorized.isInReview) inReviewCount++;
    else if (categorized.isCompleted) completedCount++;
  });

  // Get metrics for status cards (only shown in active view)
  const metrics = computeDashboardMetrics(pocs, pocUseCasesMap, asOfDate);

  const currentView = getViewCategory();

  container.innerHTML = `
    <div class="dashboard-grid">
      <!-- Top-level View Categories -->
      <div class="dashboard-view-tabs">
        <button type="button" class="view-tab ${currentView === 'active' ? 'active' : ''}" data-view="active">
          <span class="view-tab-icon"><i data-lucide="bar-chart-3"></i></span>
          <span class="view-tab-label">Active</span>
          <span class="view-tab-count">${activeCount}</span>
        </button>
        <button type="button" class="view-tab ${currentView === 'in_review' ? 'active' : ''}" data-view="in_review">
          <span class="view-tab-icon"><i data-lucide="clipboard-list"></i></span>
          <span class="view-tab-label">In Review</span>
          <span class="view-tab-count">${inReviewCount}</span>
        </button>
        <button type="button" class="view-tab ${currentView === 'completed' ? 'active' : ''}" data-view="completed">
          <span class="view-tab-icon"><i data-lucide="circle-check"></i></span>
          <span class="view-tab-label">Completed</span>
          <span class="view-tab-count">${completedCount}</span>
        </button>
      </div>

      <!-- Status Cards - Only show for Active view -->
      ${currentView === 'active' ? `
        <div class="dashboard-row dashboard-row-primary">
          ${renderMetricCard({
            id: "on_track",
            label: "On Track",
            count: metrics.onTrack.length,
            color: "success",
            isActive: isStatusFiltered("on_track")
          })}
          ${renderMetricCard({
            id: "at_risk",
            label: "At Risk",
            count: metrics.atRisk.length,
            color: "warning",
            isActive: isStatusFiltered("at_risk")
          })}
          ${renderMetricCard({
            id: "at_risk_prep",
            label: "At Risk (Customer Preparation)",
            count: metrics.atRiskPrep.length,
            color: "orange",
            isActive: isStatusFiltered("at_risk_prep")
          })}
          ${renderMetricCard({
            id: "at_risk_stalled",
            label: "At Risk (Stalled)",
            count: metrics.atRiskStalled.length,
            color: "orange",
            isActive: isStatusFiltered("at_risk_stalled")
          })}
          ${renderMetricCard({
            id: "overdue",
            label: "Overdue",
            count: metrics.overdue.length,
            color: "danger",
            isActive: isStatusFiltered("overdue")
          })}
        </div>

        <!-- Time-based Cards -->
        <div class="dashboard-row dashboard-row-secondary">
          ${renderMetricCardSmall({
            id: "this_month",
            label: "Completing This Month",
            count: metrics.completingThisMonth.length,
            isActive: isStatusFiltered("this_month")
          })}
          ${renderMetricCardSmall({
            id: "next_month",
            label: "Completing Next Month",
            count: metrics.completingNextMonth.length,
            isActive: isStatusFiltered("next_month")
          })}
        </div>
      ` : ''}
    </div>
  `;

  // Attach click handlers
  attachDashboardListeners(container);

  // Initialize Lucide icons in the newly rendered HTML
  if (window.lucide) {
    lucide.createIcons();
  }
}

/**
 * Render a primary metric card with Lucide icon
 */
function renderMetricCard({ id, label, count, color, isActive }) {
  const colorClass = `dashboard-card-${color}`;
  const activeClass = isActive ? "dashboard-card-active" : "";
  const iconName = STATUS_ICONS[id] || 'circle-help';

  return `
    <div class="dashboard-card dashboard-card-primary ${colorClass} ${activeClass}"
         data-status="${id}"
         data-count="${count}"
         title="Click to filter POCs by ${label}">
      <div class="dashboard-card-icon">
        <i data-lucide="${iconName}"></i>
      </div>
      <div class="dashboard-card-content">
        <div class="dashboard-card-count">${count}</div>
        <div class="dashboard-card-label">${label}</div>
      </div>
      ${count > 0 ? `<div class="dashboard-card-filter-icon"><i data-lucide="${isActive ? 'check' : 'filter'}"></i></div>` : ''}
    </div>
  `;
}

/**
 * Render a secondary (smaller) metric card with Lucide icon
 */
function renderMetricCardSmall({ id, label, count, isActive }) {
  const activeClass = isActive ? "dashboard-card-active" : "";
  const iconName = STATUS_ICONS[id] || 'calendar';

  return `
    <div class="dashboard-card dashboard-card-secondary ${activeClass}"
         data-status="${id}"
         data-count="${count}"
         title="Click to filter POCs by ${label}">
      <div class="dashboard-card-icon-small">
        <i data-lucide="${iconName}"></i>
      </div>
      <div class="dashboard-card-content">
        <div class="dashboard-card-count-small">${count}</div>
        <div class="dashboard-card-label-small">${label}</div>
      </div>
      ${count > 0 ? `<div class="dashboard-card-filter-icon-small"><i data-lucide="${isActive ? 'check' : 'filter'}"></i></div>` : ''}
    </div>
  `;
}

/**
 * Attach click listeners to dashboard cards and view tabs
 */
function attachDashboardListeners(container) {
  // View tab listeners
  const viewTabs = container.querySelectorAll(".view-tab");
  viewTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;
      setViewCategory(view);
    });
  });

  // Status card listeners
  const cards = container.querySelectorAll(".dashboard-card");
  cards.forEach(card => {
    const status = card.dataset.status;
    const count = parseInt(card.dataset.count) || 0;

    if (count === 0) {
      return; // Zero-count styling handled via CSS [data-count="0"]
    }

    card.addEventListener("click", () => {
      toggleStatusFilter(status);

      if (isStatusFiltered(status)) {
        card.classList.add("dashboard-card-active");
      } else {
        card.classList.remove("dashboard-card-active");
      }

      refreshFilterSummary();
    });
  });
}
