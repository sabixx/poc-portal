// overview.js - Main overview rendering with dashboard and filters
import { appState, saveSelectedSe } from "./state.js";
import { userDisplayLabel, getPucForPoc } from "./helpers.js";
import { renderActivePocCard } from "./poc_card_active.js";
import { renderInReviewPocCard } from "./poc_card_in_review.js";
import { renderClosedPocCard } from "./poc_card_closed.js";
import { categorizePoc } from "./poc_status.js";
import { renderDashboard } from "./dashboard.js";
import {
  renderFilterBar,
  extractFilterOptions,
  applyFilters,
  applyBaseFilters,
  setFilterChangeCallback,
  loadFilterState,
  loadManagerSeMapping,
  updatePocCountIndicator,
  getViewCategory
} from "./filters.js";
import { renderUseCaseStats } from "./overview_stats.js";
import { showLoading, hideLoading } from "./loading.js";

console.log("[Overview] VERSION 3.0 - View category based rendering");

// ===== init ==========================================================

export function initOverview() {
  // Set up filter change callback with loading indicator
  setFilterChangeCallback(async () => {
    showLoading("Updating...", "", true); // mini loader
    await new Promise(resolve => setTimeout(resolve, 50));
    await renderMainView();
    hideLoading();
  });
}

// ===== Build visible SEs (for backwards compatibility) ===============

export function buildVisibleSEs() {
  // Include any user who has POCs assigned to them (not just role="se")
  // This allows managers with POCs to be visible in the SE filter
  const seIdSet = new Set(appState.allPocs.map((p) => p.se).filter(Boolean));
  return appState.allUsers.filter((u) => seIdSet.has(u.id));
}

// ===== Initialize filters after login ================================

export async function initializeFilters() {
  const filterContainer = document.getElementById("filter-section");
  if (!filterContainer) return;

  // Load manager-SE mapping (determines which SEs the user can see)
  await loadManagerSeMapping(appState.pb, appState.currentUser);

  // Load saved filter state
  loadFilterState(appState.currentUser);

  // Extract filter options (respects manager-SE mapping)
  const options = extractFilterOptions(appState.allPocs, appState.allUsers, appState.currentUser);

  // Render filter bar
  renderFilterBar(filterContainer, options, appState.currentUser);
}

// ===== SE Filters (legacy - kept for compatibility) ==================

export async function renderSeFilters(visibleSEs) {
  // Initialize the new filter system instead
  await initializeFilters();
}

// ===== main overview render =========================================

export async function renderMainView() {
  const portalSection = document.getElementById("portal-section");
  if (!portalSection) return;

  console.log("[POC-PORTAL] renderMainView called");

  // Get as-of date (default to now)
  const asOfDate = appState.asOfDate || new Date();
  appState.asOfDate = asOfDate;

  // Build POC use case map for ALL POCs (needed for dashboard counts)
  const allPocUseCasesMap = new Map();
  appState.allPocs.forEach(p => {
    allPocUseCasesMap.set(p.id, getPucForPoc(p.id, appState.allPuc) || []);
  });

  // Apply BASE filters (SE/region/product/search but NOT view category) for dashboard counts
  const baseFilteredPocs = applyBaseFilters(appState.allPocs, appState.allUsers, allPocUseCasesMap, asOfDate);

  // Apply FULL filters (including view category) for card display
  const filteredPocs = applyFilters(appState.allPocs, appState.allUsers, allPocUseCasesMap, asOfDate);

  console.log("[POC-PORTAL] Base filtered POCs:", baseFilteredPocs.length, "| View filtered POCs:", filteredPocs.length, "of", appState.allPocs.length);

  // Update POC count indicator with view-filtered count
  updatePocCountIndicator(filteredPocs.length, appState.allPocs.length);

  // Build POC use case map for BASE-filtered POCs (for dashboard counts)
  const baseFilteredPocUseCasesMap = new Map();
  baseFilteredPocs.forEach(p => {
    baseFilteredPocUseCasesMap.set(p.id, allPocUseCasesMap.get(p.id) || []);
  });

  // Render dashboard with BASE-filtered data for accurate category counts
  renderDashboard(baseFilteredPocs, appState.allPocs, baseFilteredPocUseCasesMap, asOfDate);

  // Render use case stats with view-filtered POCs
  renderUseCaseStats(filteredPocs, asOfDate);

  // Render POC cards with view-filtered POCs
  await renderPocCards(filteredPocs, asOfDate);
}

// ===== POC grouping & card rendering ================================

async function renderPocCards(filteredPocs, asOfDate) {
  const viewCategory = getViewCategory();
  
  console.log("[POC-PORTAL] renderPocCards called", {
    filteredCount: filteredPocs?.length,
    viewCategory,
    asOfDate,
  });

  // Get POC container
  const pocsContainer = document.getElementById("pocs-container");
  
  if (!Array.isArray(filteredPocs)) {
    console.error("[POC-PORTAL] filteredPocs is not an array:", filteredPocs);
    return;
  }

  if (pocsContainer) {
    pocsContainer.innerHTML = "";
  } else {
    console.warn("[POC-PORTAL] pocs-container not found");
    return;
  }

  // Group POCs by SE
  const groups = groupBySe(filteredPocs);
  
  console.log("[POC-PORTAL] groups:", groups.length);

  // Choose renderer based on view category
  let cardRenderer;
  switch (viewCategory) {
    case 'active':
      cardRenderer = renderActivePocCard;
      break;
    case 'in_review':
      cardRenderer = renderInReviewPocCard;
      break;
    case 'completed':
    default:
      cardRenderer = renderClosedPocCard;
      break;
  }
  
  await renderPocGroupList(groups, pocsContainer, cardRenderer);
  
  // Show empty state if no POCs
  if (filteredPocs.length === 0) {
    pocsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">No POCs found</div>
        <div class="empty-state-hint">Try adjusting your filters or view category</div>
      </div>
    `;
  }
}

async function renderPocGroupList(groups, container, cardRenderer) {
  for (const group of groups) {
    const block = document.createElement("div");
    block.className = "poc-group";

    const heading = document.createElement("h3");
    heading.className = "poc-group-heading";
    heading.textContent = `SE: ${group.label || "Unknown SE"}`;
    block.appendChild(heading);

    const list = document.createElement("div");
    list.className = "poc-group-grid";

    for (const p of group.items) {
      const card = await cardRenderer(p);
      list.appendChild(card);
    }

    block.appendChild(list);
    container.appendChild(block);
  }
}

function groupBySe(pocs) {
  const resultsMap = new Map();

  pocs.forEach((p) => {
    const seId = p.se || "unknown";
    let group = resultsMap.get(seId);
    if (!group) {
      const seUser = appState.allUsers.find((u) => u.id === seId);
      const label = seUser ? userDisplayLabel(seUser) : "Unknown SE";
      group = { seId, label, items: [] };
      resultsMap.set(seId, group);
    }
    group.items.push(p);
  });

  return Array.from(resultsMap.values()).sort((a, b) =>
    (a.label || "").localeCompare(b.label || "")
  );
}