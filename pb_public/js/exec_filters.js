// exec_filters.js - Executive Dashboard Filter System
// VERSION 1.0 - Filter-driven exploration with saved views

import { categorizePoc } from "./poc_status.js";

console.log("[ExecFilters] VERSION 1.0 - Filter system initialized");

const STORAGE_KEY_FILTERS = "execDashboard_filters";
const STORAGE_KEY_VIEWS = "execDashboard_savedViews";

/**
 * Filter state
 */
const execFilterState = {
  pocStatus: 'open',              // 'open' | 'closed' | 'all'
  selectedProducts: new Set(),    // empty = all
  selectedRegions: new Set(),     // empty = all
  selectedERs: new Set(),         // optional ER filter
  selectedCustomers: new Set(),   // optional customer filter
  dealBreakerMode: 'include',     // 'include' | 'exclude' | 'only'
  commercialResultFilter: 'all',  // 'all' | 'open' | 'won' | 'lost' | 'no_decision'
  topNToggle: 5,                  // 5 or 10
  activePresetId: null,           // currently active predefined filter preset
  onFilterChange: null,           // callback
  _cachedOptions: null,           // cache for dropdown options
};

/**
 * Predefined filter presets
 */
export const PREDEFINED_PRESETS = [
  {
    id: 'revenue_at_risk',
    name: 'Revenue at Risk',
    description: 'ERs with Deal Blockers for open deals',
    filters: {
      pocStatus: 'all',
      dealBreakerMode: 'only',
      commercialResultFilter: 'open',
    }
  },
  {
    id: 'potential_win_rate',
    name: 'Potential Win Rate Increase ',
    description: 'All ERs for open deals (including non-blockers)',
    filters: {
      pocStatus: 'all',
      dealBreakerMode: 'include',
      commercialResultFilter: 'open',
    }
  },
  {
    id: 'lost_missing_capabilities',
    name: 'Lost analysis',
    description: 'Lost deals with ERs or blockers',
    filters: {
      pocStatus: 'all',
      dealBreakerMode: 'include',
      commercialResultFilter: 'lost',
    }
  }
];

/**
 * Get current filter state (immutable copy)
 */
export function getExecFilterState() {
  return {
    pocStatus: execFilterState.pocStatus,
    selectedProducts: new Set(execFilterState.selectedProducts),
    selectedRegions: new Set(execFilterState.selectedRegions),
    selectedERs: new Set(execFilterState.selectedERs),
    selectedCustomers: new Set(execFilterState.selectedCustomers),
    dealBreakerMode: execFilterState.dealBreakerMode,
    commercialResultFilter: execFilterState.commercialResultFilter,
    activePresetId: execFilterState.activePresetId,
    topNToggle: execFilterState.topNToggle,
  };
}

/**
 * Apply a predefined filter preset
 */
export function applyPreset(presetId) {
  const preset = PREDEFINED_PRESETS.find(p => p.id === presetId);
  if (!preset) {
    console.warn("[ExecFilters] Preset not found:", presetId);
    return false;
  }

  // Clear existing selections
  execFilterState.selectedProducts.clear();
  execFilterState.selectedRegions.clear();
  execFilterState.selectedERs.clear();
  execFilterState.selectedCustomers.clear();

  // Apply preset filters
  execFilterState.pocStatus = preset.filters.pocStatus || 'all';
  execFilterState.dealBreakerMode = preset.filters.dealBreakerMode || 'include';
  execFilterState.commercialResultFilter = preset.filters.commercialResultFilter || 'all';
  execFilterState.activePresetId = presetId;

  triggerFilterChange();
  console.log("[ExecFilters] Applied preset:", preset.name);
  return true;
}

/**
 * Clear active preset (deselect preset but keep current filters)
 */
export function clearPreset() {
  execFilterState.activePresetId = null;
  triggerFilterChange();
}

/**
 * Get active preset ID
 */
export function getActivePresetId() {
  return execFilterState.activePresetId;
}

/**
 * Set filter change callback
 */
export function setExecFilterChangeCallback(callback) {
  execFilterState.onFilterChange = callback;
}

/**
 * Trigger filter change
 */
function triggerFilterChange() {
  saveFilterState();
  if (execFilterState.onFilterChange) {
    execFilterState.onFilterChange(getExecFilterState());
  }
}

/**
 * Save filter state to localStorage
 */
function saveFilterState() {
  try {
    const state = {
      pocStatus: execFilterState.pocStatus,
      selectedProducts: Array.from(execFilterState.selectedProducts),
      selectedRegions: Array.from(execFilterState.selectedRegions),
      selectedERs: Array.from(execFilterState.selectedERs),
      selectedCustomers: Array.from(execFilterState.selectedCustomers),
      dealBreakerMode: execFilterState.dealBreakerMode,
      commercialResultFilter: execFilterState.commercialResultFilter,
      activePresetId: execFilterState.activePresetId,
      topNToggle: execFilterState.topNToggle,
    };
    localStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(state));
  } catch (e) {
    console.error("[ExecFilters] Failed to save filter state:", e);
  }
}

/**
 * Load filter state from localStorage
 */
export function loadFilterState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_FILTERS);
    if (saved) {
      const parsed = JSON.parse(saved);
      execFilterState.pocStatus = parsed.pocStatus || 'open';
      execFilterState.selectedProducts = new Set(parsed.selectedProducts || []);
      execFilterState.selectedRegions = new Set(parsed.selectedRegions || []);
      execFilterState.selectedERs = new Set(parsed.selectedERs || []);
      execFilterState.selectedCustomers = new Set(parsed.selectedCustomers || []);
      execFilterState.dealBreakerMode = parsed.dealBreakerMode || 'include';
      execFilterState.commercialResultFilter = parsed.commercialResultFilter || 'all';
      execFilterState.activePresetId = parsed.activePresetId || null;
      execFilterState.topNToggle = parsed.topNToggle || 5;
      console.log("[ExecFilters] Loaded filter state from localStorage");
    }
  } catch (e) {
    console.error("[ExecFilters] Failed to load filter state:", e);
  }
}

/**
 * Reset filters to defaults
 */
export function resetFilters() {
  execFilterState.pocStatus = 'open';
  execFilterState.selectedProducts.clear();
  execFilterState.selectedRegions.clear();
  execFilterState.selectedERs.clear();
  execFilterState.selectedCustomers.clear();
  execFilterState.dealBreakerMode = 'include';
  execFilterState.commercialResultFilter = 'all';
  execFilterState.activePresetId = null;
  execFilterState.topNToggle = 5;
  triggerFilterChange();
}

// ===== Saved Views =====

/**
 * Generate unique ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

/**
 * Get all saved views
 */
export function getSavedViews() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_VIEWS);
    if (saved) {
      const data = JSON.parse(saved);
      return data.views || [];
    }
  } catch (e) {
    console.error("[ExecFilters] Failed to load saved views:", e);
  }
  return [];
}

/**
 * Get active view ID
 */
export function getActiveViewId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_VIEWS);
    if (saved) {
      const data = JSON.parse(saved);
      return data.activeViewId || null;
    }
  } catch (e) {
    console.error("[ExecFilters] Failed to get active view:", e);
  }
  return null;
}

/**
 * Save views to localStorage
 */
function saveViewsToStorage(views, activeViewId = null) {
  try {
    localStorage.setItem(STORAGE_KEY_VIEWS, JSON.stringify({
      views,
      activeViewId,
    }));
  } catch (e) {
    console.error("[ExecFilters] Failed to save views:", e);
  }
}

/**
 * Save current filters as a new view
 */
export function saveFilterView(name) {
  if (!name || !name.trim()) {
    console.warn("[ExecFilters] Cannot save view without a name");
    return null;
  }

  const views = getSavedViews();
  const newView = {
    id: generateId(),
    name: name.trim(),
    filters: {
      pocStatus: execFilterState.pocStatus,
      selectedProducts: Array.from(execFilterState.selectedProducts),
      selectedRegions: Array.from(execFilterState.selectedRegions),
      selectedERs: Array.from(execFilterState.selectedERs),
      selectedCustomers: Array.from(execFilterState.selectedCustomers),
      dealBreakerMode: execFilterState.dealBreakerMode,
      commercialResultFilter: execFilterState.commercialResultFilter,
      topNToggle: execFilterState.topNToggle,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  views.push(newView);
  saveViewsToStorage(views, newView.id);
  console.log("[ExecFilters] Saved new view:", newView.name);
  return newView;
}

/**
 * Load a saved view by ID
 */
export function loadFilterView(viewId) {
  const views = getSavedViews();
  const view = views.find(v => v.id === viewId);
  if (!view) {
    console.warn("[ExecFilters] View not found:", viewId);
    return false;
  }

  const f = view.filters;
  execFilterState.pocStatus = f.pocStatus || 'open';
  execFilterState.selectedProducts = new Set(f.selectedProducts || []);
  execFilterState.selectedRegions = new Set(f.selectedRegions || []);
  execFilterState.selectedERs = new Set(f.selectedERs || []);
  execFilterState.selectedCustomers = new Set(f.selectedCustomers || []);
  execFilterState.dealBreakerMode = f.dealBreakerMode || 'include';
  execFilterState.commercialResultFilter = f.commercialResultFilter || 'all';
  execFilterState.activePresetId = null; // Clear any active preset when loading a saved view
  execFilterState.topNToggle = f.topNToggle || 5;

  saveViewsToStorage(views, viewId);
  triggerFilterChange();
  console.log("[ExecFilters] Loaded view:", view.name);
  return true;
}

/**
 * Update an existing view with current filters
 */
export function updateFilterView(viewId) {
  const views = getSavedViews();
  const idx = views.findIndex(v => v.id === viewId);
  if (idx === -1) {
    console.warn("[ExecFilters] View not found for update:", viewId);
    return false;
  }

  views[idx].filters = {
    pocStatus: execFilterState.pocStatus,
    selectedProducts: Array.from(execFilterState.selectedProducts),
    selectedRegions: Array.from(execFilterState.selectedRegions),
    selectedERs: Array.from(execFilterState.selectedERs),
    selectedCustomers: Array.from(execFilterState.selectedCustomers),
    dealBreakerMode: execFilterState.dealBreakerMode,
    commercialResultFilter: execFilterState.commercialResultFilter,
    topNToggle: execFilterState.topNToggle,
  };
  views[idx].updatedAt = new Date().toISOString();

  saveViewsToStorage(views, viewId);
  console.log("[ExecFilters] Updated view:", views[idx].name);
  return true;
}

/**
 * Delete a saved view
 */
export function deleteFilterView(viewId) {
  let views = getSavedViews();
  const activeId = getActiveViewId();
  views = views.filter(v => v.id !== viewId);
  saveViewsToStorage(views, activeId === viewId ? null : activeId);
  console.log("[ExecFilters] Deleted view:", viewId);
  return true;
}

/**
 * Clear active view (deselect)
 */
export function clearActiveView() {
  const views = getSavedViews();
  saveViewsToStorage(views, null);
}

// ===== Filter Options Extraction =====

/**
 * Extract filter options from data
 */
export function extractFilterOptions(pocs, pocFeatureRequests, users) {
  const products = new Set();
  const regions = new Set();
  const customers = new Set();
  const ers = new Map(); // id -> { id, title }
  let hasNoRegionSEs = false;

  // Extract from POCs
  pocs.forEach(p => {
    if (p.product) products.add(p.product);
    if (p.customer_name) customers.add(p.customer_name);
  });

  // Extract regions from SE users
  users.forEach(u => {
    if (u.role === "se") {
      if (u.region && u.region.trim()) {
        regions.add(u.region);
      } else {
        hasNoRegionSEs = true;
      }
    }
  });

  // Add "No Region" option if there are SEs without regions
  if (hasNoRegionSEs) {
    regions.add("__no_region__");
  }

  // Extract ERs from poc_feature_requests
  pocFeatureRequests.forEach(pfr => {
    if (pfr.expand?.feature_request) {
      const er = pfr.expand.feature_request;
      if (!ers.has(er.id)) {
        ers.set(er.id, { id: er.id, title: er.title || 'Unknown ER' });
      }
    }
  });

  const options = {
    products: Array.from(products).sort(),
    regions: Array.from(regions).sort(),
    customers: Array.from(customers).sort(),
    ers: Array.from(ers.values()).sort((a, b) => a.title.localeCompare(b.title)),
  };

  execFilterState._cachedOptions = options;
  return options;
}

// ===== Filter Application =====

/**
 * Check if POC is "Open" (Active or In Review)
 */
export function isOpenPoc(poc, pocUseCasesMap, asOfDate) {
  const pocUcs = pocUseCasesMap.get(poc.id) || [];
  const categorized = categorizePoc(poc, pocUcs, asOfDate);
  return categorized.isActive || categorized.isInReview;
}

/**
 * Check if POC is "Closed" (Completed)
 */
export function isClosedPoc(poc, pocUseCasesMap, asOfDate) {
  const pocUcs = pocUseCasesMap.get(poc.id) || [];
  const categorized = categorizePoc(poc, pocUcs, asOfDate);
  return categorized.isCompleted;
}

/**
 * Get POC status label
 */
export function getPocStatusLabel(poc, pocUseCasesMap, asOfDate) {
  if (isOpenPoc(poc, pocUseCasesMap, asOfDate)) return 'Open';
  if (isClosedPoc(poc, pocUseCasesMap, asOfDate)) return 'Closed';
  return 'Unknown';
}

/**
 * Apply filters to POCs
 * Returns filtered POCs based on current filter state
 */
export function applyExecFilters(pocs, pocFeatureRequestsByPoc, users, pocUseCasesMap, asOfDate) {
  console.log("[ExecFilters] Applying filters to", pocs.length, "POCs");
  console.log("[ExecFilters] Feature requests map size:", pocFeatureRequestsByPoc.size);
  console.log("[ExecFilters] Current filter state:", {
    pocStatus: execFilterState.pocStatus,
    dealBreakerMode: execFilterState.dealBreakerMode,
    selectedProducts: execFilterState.selectedProducts.size,
    selectedRegions: execFilterState.selectedRegions.size,
    selectedERs: execFilterState.selectedERs.size,
  });

  // Build user region lookup
  const userRegionMap = new Map();
  users.forEach(u => {
    if (u.region) userRegionMap.set(u.id, u.region);
  });

  // Build POC to ERs lookup for ER filtering
  const pocERsMap = new Map(); // pocId -> Set of erIds
  pocFeatureRequestsByPoc.forEach((pfrs, pocId) => {
    const erIds = new Set();
    pfrs.forEach(pfr => {
      if (pfr.feature_request) {
        erIds.add(pfr.feature_request);
      }
    });
    pocERsMap.set(pocId, erIds);
  });

  // Build POC to deal breaker status
  const pocHasDealBreaker = new Map(); // pocId -> boolean
  let dealBreakerCount = 0;
  pocFeatureRequestsByPoc.forEach((pfrs, pocId) => {
    // Check each poc_feature_request for is_deal_breaker
    // Handle both boolean true and string "true"
    const hasDealBreaker = pfrs.some(pfr => {
      const isDealBreaker = pfr.is_deal_breaker === true || pfr.is_deal_breaker === "true";
      // Log the first few to debug
      if (dealBreakerCount < 3 && isDealBreaker) {
        console.log("[ExecFilters] Found deal breaker:", { pocId, is_deal_breaker: pfr.is_deal_breaker, type: typeof pfr.is_deal_breaker });
      }
      return isDealBreaker;
    });
    if (hasDealBreaker) dealBreakerCount++;
    pocHasDealBreaker.set(pocId, hasDealBreaker);
  });
  console.log("[ExecFilters] POCs with deal breakers:", dealBreakerCount);

  const filtered = pocs.filter(p => {
    // POC Status filter
    if (execFilterState.pocStatus === 'open') {
      if (!isOpenPoc(p, pocUseCasesMap, asOfDate)) return false;
    } else if (execFilterState.pocStatus === 'closed') {
      if (!isClosedPoc(p, pocUseCasesMap, asOfDate)) return false;
    }
    // 'all' passes through

    // Product filter
    if (execFilterState.selectedProducts.size > 0) {
      if (!p.product || !execFilterState.selectedProducts.has(p.product)) return false;
    }

    // Region filter (via SE user)
    if (execFilterState.selectedRegions.size > 0) {
      const seRegion = userRegionMap.get(p.se);
      if (!seRegion || !execFilterState.selectedRegions.has(seRegion)) return false;
    }

    // Customer filter
    if (execFilterState.selectedCustomers.size > 0) {
      if (!p.customer_name || !execFilterState.selectedCustomers.has(p.customer_name)) return false;
    }

    // ER filter - POC must have at least one of the selected ERs
    if (execFilterState.selectedERs.size > 0) {
      const pocERs = pocERsMap.get(p.id) || new Set();
      let hasMatchingER = false;
      for (const erId of execFilterState.selectedERs) {
        if (pocERs.has(erId)) {
          hasMatchingER = true;
          break;
        }
      }
      if (!hasMatchingER) return false;
    }

    // Deal Breaker filter
    const hasDealBreaker = pocHasDealBreaker.get(p.id) || false;
    if (execFilterState.dealBreakerMode === 'exclude') {
      if (hasDealBreaker) return false;
    } else if (execFilterState.dealBreakerMode === 'only') {
      if (!hasDealBreaker) return false;
    }
    // 'include' passes through

    // Commercial Result filter (for predefined presets)
    const commercialResult = p.commercial_result || 'unknown';
    if (execFilterState.commercialResultFilter !== 'all') {
      if (execFilterState.commercialResultFilter === 'open') {
        // "open" = unknown/empty commercial result (deal not closed yet)
        if (commercialResult !== 'unknown') return false;
      } else if (execFilterState.commercialResultFilter === 'won') {
        if (commercialResult !== 'now_customer') return false;
      } else if (execFilterState.commercialResultFilter === 'lost') {
        if (commercialResult !== 'lost') return false;
      } else if (execFilterState.commercialResultFilter === 'no_decision') {
        if (commercialResult !== 'no_decision') return false;
      }
    }

    return true;
  });

  console.log("[ExecFilters] Filtered result:", filtered.length, "POCs");

  // Debug: Log deal breaker filtering results
  if (execFilterState.dealBreakerMode === 'only') {
    console.log("[ExecFilters] 'Only Deal Breakers' mode - showing", filtered.length, "POCs");
    if (filtered.length === 0 && dealBreakerCount > 0) {
      console.warn("[ExecFilters] Warning: Deal breakers exist but none passed POC status filter");
    }
  }

  return filtered;
}

// ===== Filter UI Rendering =====

/**
 * Render the filter bar
 */
export function renderExecFilterBar(container, options) {
  const { products, regions, customers, ers } = options;

  container.innerHTML = `
    <!-- Predefined Presets Row -->
    <div class="exec-preset-row">
      <span class="exec-preset-label">Quick Filters:</span>
      ${PREDEFINED_PRESETS.map(preset => `
        <button type="button"
          class="exec-preset-btn ${execFilterState.activePresetId === preset.id ? 'active' : ''}"
          data-preset-id="${preset.id}"
          title="${preset.description}">
          ${preset.name}
        </button>
      `).join('')}
      ${execFilterState.activePresetId ? `
        <button type="button" class="exec-preset-clear-btn" id="exec-clear-preset">Clear</button>
      ` : ''}
    </div>

    <div class="exec-filter-row">
      <!-- POC Status Toggle -->
      <div class="exec-filter-group">
        <span class="exec-filter-label">POC Status</span>
        <div class="exec-status-toggle">
          <button type="button" class="exec-status-toggle-btn ${execFilterState.pocStatus === 'open' ? 'active' : ''}" data-status="open">Open</button>
          <button type="button" class="exec-status-toggle-btn ${execFilterState.pocStatus === 'closed' ? 'active' : ''}" data-status="closed">Closed</button>
          <button type="button" class="exec-status-toggle-btn ${execFilterState.pocStatus === 'all' ? 'active' : ''}" data-status="all">All</button>
        </div>
      </div>

      <!-- Product Multi-Select -->
      <div class="exec-filter-group">
        <span class="exec-filter-label">Product</span>
        <div class="exec-filter-dropdown" data-filter="product">
          <button type="button" class="exec-filter-dropdown-btn">
            <span class="exec-filter-dropdown-text">${getDropdownLabel(execFilterState.selectedProducts, products, 'All Products')}</span>
            <span class="exec-filter-dropdown-arrow">&#9662;</span>
          </button>
          <div class="exec-filter-dropdown-menu hidden">
            <div class="exec-filter-menu-header">
              <button type="button" class="exec-filter-action-btn" data-action="all">All</button>
              <button type="button" class="exec-filter-action-btn" data-action="clear">Clear</button>
            </div>
            <div class="exec-filter-menu-items">
              ${products.map(p => `
                <label class="exec-filter-checkbox-item">
                  <input type="checkbox" value="${escapeHtml(p)}" ${execFilterState.selectedProducts.has(p) ? 'checked' : ''}>
                  <span>${escapeHtml(p)}</span>
                </label>
              `).join('')}
              ${products.length === 0 ? '<div class="exec-filter-no-options">No products available</div>' : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Region Multi-Select -->
      <div class="exec-filter-group">
        <span class="exec-filter-label">Region</span>
        <div class="exec-filter-dropdown" data-filter="region">
          <button type="button" class="exec-filter-dropdown-btn">
            <span class="exec-filter-dropdown-text">${getDropdownLabel(execFilterState.selectedRegions, regions, 'All Regions')}</span>
            <span class="exec-filter-dropdown-arrow">&#9662;</span>
          </button>
          <div class="exec-filter-dropdown-menu hidden">
            <div class="exec-filter-menu-header">
              <button type="button" class="exec-filter-action-btn" data-action="all">All</button>
              <button type="button" class="exec-filter-action-btn" data-action="clear">Clear</button>
            </div>
            <div class="exec-filter-menu-items">
              ${regions.map(r => `
                <label class="exec-filter-checkbox-item">
                  <input type="checkbox" value="${escapeHtml(r)}" ${execFilterState.selectedRegions.has(r) ? 'checked' : ''}>
                  <span>${escapeHtml(r)}</span>
                </label>
              `).join('')}
              ${regions.length === 0 ? '<div class="exec-filter-no-options">No regions available</div>' : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Feature Request Multi-Select -->
      <div class="exec-filter-group">
        <span class="exec-filter-label">Feature Request</span>
        <div class="exec-filter-dropdown" data-filter="er">
          <button type="button" class="exec-filter-dropdown-btn">
            <span class="exec-filter-dropdown-text">${getERDropdownLabel(execFilterState.selectedERs, ers)}</span>
            <span class="exec-filter-dropdown-arrow">&#9662;</span>
          </button>
          <div class="exec-filter-dropdown-menu hidden">
            <div class="exec-filter-menu-header">
              <button type="button" class="exec-filter-action-btn" data-action="all">All</button>
              <button type="button" class="exec-filter-action-btn" data-action="clear">Clear</button>
            </div>
            <div class="exec-filter-menu-items">
              ${ers.map(er => `
                <label class="exec-filter-checkbox-item">
                  <input type="checkbox" value="${er.id}" ${execFilterState.selectedERs.has(er.id) ? 'checked' : ''}>
                  <span title="${escapeHtml(er.title)}">${truncate(er.title, 40)}</span>
                </label>
              `).join('')}
              ${ers.length === 0 ? '<div class="exec-filter-no-options">No feature requests found</div>' : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Customer Multi-Select -->
      <div class="exec-filter-group">
        <span class="exec-filter-label">Customer</span>
        <div class="exec-filter-dropdown" data-filter="customer">
          <button type="button" class="exec-filter-dropdown-btn">
            <span class="exec-filter-dropdown-text">${getDropdownLabel(execFilterState.selectedCustomers, customers, 'All Customers')}</span>
            <span class="exec-filter-dropdown-arrow">&#9662;</span>
          </button>
          <div class="exec-filter-dropdown-menu hidden">
            <div class="exec-filter-menu-header">
              <button type="button" class="exec-filter-action-btn" data-action="all">All</button>
              <button type="button" class="exec-filter-action-btn" data-action="clear">Clear</button>
            </div>
            <div class="exec-filter-menu-items">
              ${customers.map(c => `
                <label class="exec-filter-checkbox-item">
                  <input type="checkbox" value="${escapeHtml(c)}" ${execFilterState.selectedCustomers.has(c) ? 'checked' : ''}>
                  <span>${escapeHtml(c)}</span>
                </label>
              `).join('')}
              ${customers.length === 0 ? '<div class="exec-filter-no-options">No customers available</div>' : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Deal Breaker Toggle -->
      <div class="exec-filter-group">
        <span class="exec-filter-label">Deal Breaker</span>
        <div class="exec-deal-breaker-toggle">
          <button type="button" class="exec-deal-breaker-btn ${execFilterState.dealBreakerMode === 'include' ? 'active' : ''}" data-mode="include">Include</button>
          <button type="button" class="exec-deal-breaker-btn ${execFilterState.dealBreakerMode === 'exclude' ? 'active' : ''}" data-mode="exclude">Exclude</button>
          <button type="button" class="exec-deal-breaker-btn ${execFilterState.dealBreakerMode === 'only' ? 'active' : ''}" data-mode="only">Only</button>
        </div>
      </div>

      <!-- Reset Button -->
      <div class="exec-filter-group" style="align-self: flex-end;">
        <button type="button" class="exec-filter-action-btn" id="exec-reset-filters">Reset</button>
      </div>
    </div>
  `;

  attachFilterListeners(container, options);
}

/**
 * Attach event listeners to filter bar
 */
function attachFilterListeners(container, options) {
  // Preset buttons
  container.querySelectorAll('.exec-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetId = btn.dataset.presetId;
      applyPreset(presetId);
      // Re-render will happen via triggerFilterChange
    });
  });

  // Clear preset button
  const clearPresetBtn = container.querySelector('#exec-clear-preset');
  if (clearPresetBtn) {
    clearPresetBtn.addEventListener('click', () => {
      resetFilters();
    });
  }

  // POC Status toggle
  container.querySelectorAll('.exec-status-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      execFilterState.pocStatus = btn.dataset.status;
      execFilterState.activePresetId = null; // Clear preset when manually changing filters
      container.querySelectorAll('.exec-status-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      triggerFilterChange();
    });
  });

  // Deal Breaker toggle
  container.querySelectorAll('.exec-deal-breaker-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      execFilterState.dealBreakerMode = btn.dataset.mode;
      execFilterState.activePresetId = null; // Clear preset when manually changing filters
      container.querySelectorAll('.exec-deal-breaker-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      triggerFilterChange();
    });
  });

  // Dropdown toggles
  container.querySelectorAll('.exec-filter-dropdown-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = btn.closest('.exec-filter-dropdown');
      const menu = dropdown.querySelector('.exec-filter-dropdown-menu');
      const wasHidden = menu.classList.contains('hidden');

      // Close all menus
      container.querySelectorAll('.exec-filter-dropdown-menu').forEach(m => m.classList.add('hidden'));

      if (wasHidden) {
        menu.classList.remove('hidden');
      }
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.exec-filter-dropdown')) {
      container.querySelectorAll('.exec-filter-dropdown-menu').forEach(m => m.classList.add('hidden'));
    }
  });

  // Prevent dropdown from closing when clicking inside
  container.querySelectorAll('.exec-filter-dropdown-menu').forEach(menu => {
    menu.addEventListener('click', e => e.stopPropagation());
  });

  // Dropdown action buttons (All/Clear)
  container.querySelectorAll('.exec-filter-menu-header .exec-filter-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dropdown = btn.closest('.exec-filter-dropdown');
      const filterType = dropdown.dataset.filter;
      const action = btn.dataset.action;

      if (action === 'all') {
        getFilterSet(filterType).clear();
      } else if (action === 'clear') {
        getFilterSet(filterType).clear();
      }

      updateDropdownCheckboxes(dropdown, filterType);
      updateDropdownLabel(dropdown, filterType, options);
      triggerFilterChange();
    });
  });

  // Checkbox changes
  container.querySelectorAll('.exec-filter-checkbox-item input').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const dropdown = checkbox.closest('.exec-filter-dropdown');
      const filterType = dropdown.dataset.filter;
      const filterSet = getFilterSet(filterType);

      if (checkbox.checked) {
        filterSet.add(checkbox.value);
      } else {
        filterSet.delete(checkbox.value);
      }

      updateDropdownLabel(dropdown, filterType, options);
      triggerFilterChange();
    });
  });

  // Reset button
  const resetBtn = container.querySelector('#exec-reset-filters');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetFilters();
      // Re-render the filter bar
      renderExecFilterBar(container, options);
    });
  }
}

/**
 * Get filter set by type
 */
function getFilterSet(filterType) {
  switch (filterType) {
    case 'product': return execFilterState.selectedProducts;
    case 'region': return execFilterState.selectedRegions;
    case 'customer': return execFilterState.selectedCustomers;
    case 'er': return execFilterState.selectedERs;
    default: return new Set();
  }
}

/**
 * Update dropdown checkboxes
 */
function updateDropdownCheckboxes(dropdown, filterType) {
  const filterSet = getFilterSet(filterType);
  dropdown.querySelectorAll('.exec-filter-checkbox-item input').forEach(cb => {
    cb.checked = filterSet.size === 0 || filterSet.has(cb.value);
  });
}

/**
 * Update dropdown label
 */
function updateDropdownLabel(dropdown, filterType, options) {
  const textEl = dropdown.querySelector('.exec-filter-dropdown-text');
  const filterSet = getFilterSet(filterType);

  let label;
  switch (filterType) {
    case 'product':
      label = getDropdownLabel(filterSet, options.products, 'All Products');
      break;
    case 'region':
      label = getDropdownLabel(filterSet, options.regions, 'All Regions');
      break;
    case 'customer':
      label = getDropdownLabel(filterSet, options.customers, 'All Customers');
      break;
    case 'er':
      label = getERDropdownLabel(filterSet, options.ers);
      break;
    default:
      label = 'All';
  }

  textEl.textContent = label;
}

/**
 * Get dropdown label for simple sets
 */
function getDropdownLabel(selectedSet, _allOptions, allLabel) {
  if (selectedSet.size === 0) return allLabel;
  if (selectedSet.size === 1) return Array.from(selectedSet)[0];
  return `${selectedSet.size} selected`;
}

/**
 * Get dropdown label for ERs
 */
function getERDropdownLabel(selectedSet, allERs) {
  if (selectedSet.size === 0) return 'All ERs';
  if (selectedSet.size === 1) {
    const erId = Array.from(selectedSet)[0];
    const er = allERs.find(e => e.id === erId);
    return er ? truncate(er.title, 20) : '1 ER';
  }
  return `${selectedSet.size} ERs`;
}

// ===== Saved Views UI =====

/**
 * Render saved views bar
 */
export function renderSavedViewsBar(container) {
  const views = getSavedViews();
  const activeId = getActiveViewId();

  container.innerHTML = `
    <span class="exec-saved-views-label">Saved Views:</span>
    ${views.map(v => `
      <div class="exec-saved-view-chip ${v.id === activeId ? 'active' : ''}" data-view-id="${v.id}">
        <span class="exec-saved-view-name">${escapeHtml(v.name)}</span>
        <span class="exec-saved-view-delete" data-delete-id="${v.id}" title="Delete view">&times;</span>
      </div>
    `).join('')}
    ${views.length === 0 ? '<span style="color: var(--text-secondary); font-size: 0.85rem;">No saved views</span>' : ''}
    <button type="button" class="exec-save-view-btn" id="exec-save-view-btn">+ Save Current</button>
  `;

  attachSavedViewListeners(container);
}

/**
 * Attach saved view listeners
 */
function attachSavedViewListeners(container) {
  // Load view on chip click
  container.querySelectorAll('.exec-saved-view-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('exec-saved-view-delete')) return;
      const viewId = chip.dataset.viewId;
      loadFilterView(viewId);
      renderSavedViewsBar(container);
    });
  });

  // Delete view
  container.querySelectorAll('.exec-saved-view-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const viewId = btn.dataset.deleteId;
      if (confirm('Delete this saved view?')) {
        deleteFilterView(viewId);
        renderSavedViewsBar(container);
      }
    });
  });

  // Save new view
  const saveBtn = container.querySelector('#exec-save-view-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const name = prompt('Enter a name for this view:');
      if (name && name.trim()) {
        saveFilterView(name);
        renderSavedViewsBar(container);
      }
    });
  }
}

// ===== Utility Functions =====

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
 * Set Top N toggle value
 */
export function setTopNToggle(n) {
  execFilterState.topNToggle = n;
  triggerFilterChange();
}

/**
 * Get Top N toggle value
 */
export function getTopNToggle() {
  return execFilterState.topNToggle;
}
