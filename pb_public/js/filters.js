// filters.js - Filtering functionality for POC Portal
// VERSION 3.1 - URL-synced view categories
// Handles SE, Region, Product, Search, and Status filters

import { categorizePoc } from "./poc_status.js";
import { navigateToDashboard } from "./router.js";

console.log("[Filters] VERSION 3.1 - URL-synced view categories");

/**
 * Filter state
 */
const filterState = {
  selectedSEs: new Set(),
  selectedProducts: new Set(),
  selectedRegions: new Set(),
  selectedStatuses: new Set(), // Multiple status selection allowed
  searchQuery: "",
  onFilterChange: null,
  // Manager's allowed SEs (populated from manager_se_map)
  allowedSeIds: null, // null means all allowed, Set means restricted
  // View category: 'active', 'in_review', 'completed'
  viewCategory: "active",
  // Cache for filter options
  _cachedOptions: null,
  _currentUser: null
};

/**
 * Get current view category
 */
export function getViewCategory() {
  return filterState.viewCategory;
}

/**
 * Set view category and trigger filter change
 * @param {string} category - View category: 'active', 'in_review', 'completed'
 * @param {boolean} skipUrlUpdate - If true, don't update URL (used when URL already changed)
 */
export function setViewCategory(category, skipUrlUpdate = false) {
  console.log("[Filters] Setting view category:", category, "skipUrlUpdate:", skipUrlUpdate);
  filterState.viewCategory = category;
  localStorage.setItem("pocPortal_viewCategory", category);

  // Update URL if not skipped (to avoid infinite loops)
  if (!skipUrlUpdate) {
    navigateToDashboard(category);
  }

  triggerFilterChange();
}

/**
 * Load SE mappings based on user role
 * - Managers: Load from manager_se_map for default selection
 * - AEs: Load from ae_se_map for default selection  
 * NOTE: This only affects DEFAULT selection, not visibility (everyone can see all SEs)
 */
export async function loadManagerSeMapping(pb, currentUser) {
  if (!currentUser || !pb) return;
  
  console.log("[Filters] Loading SE mapping for:", currentUser.email, "role:", currentUser.role);
  filterState._currentUser = currentUser;
  
  // Managers: load their mapped SEs for default selection
  if (currentUser.role === "manager") {
    try {
      const mappings = await pb.collection("manager_se_map").getFullList({
        filter: `manager = "${currentUser.id}"`,
        $autoCancel: false
      });
      
      console.log("[Filters] Found manager_se_map entries:", mappings.length);

      // Always include the manager's own ID so their own POCs show up
      filterState.allowedSeIds = new Set();
      filterState.allowedSeIds.add(currentUser.id);

      if (mappings.length > 0) {
        mappings.forEach(m => {
          console.log("[Filters] Mapping entry:", m);
          if (Array.isArray(m.se)) {
            m.se.forEach(seId => filterState.allowedSeIds.add(seId));
          } else if (m.se) {
            filterState.allowedSeIds.add(m.se);
          }
        });
      }
      console.log("[Filters] Manager's default SEs (including self):", Array.from(filterState.allowedSeIds));
    } catch (e) {
      console.error("[Filters] Failed to load manager-SE mapping:", e);
      filterState.allowedSeIds = null;
    }
  } 
  // AEs: load their mapped SEs for default selection
  else if (currentUser.role === "ae") {
    try {
      const mappings = await pb.collection("ae_se_map").getFullList({
        filter: `ae = "${currentUser.id}"`,
        $autoCancel: false
      });

      console.log("[Filters] Found ae_se_map entries:", mappings.length);

      if (mappings.length > 0) {
        filterState.allowedSeIds = new Set();
        mappings.forEach(m => {
          if (m.se) filterState.allowedSeIds.add(m.se);
        });
        console.log("[Filters] AE's default SEs:", Array.from(filterState.allowedSeIds));
      } else {
        filterState.allowedSeIds = null;
      }
    } catch (e) {
      console.error("[Filters] Failed to load AE-SE mapping:", e);
      filterState.allowedSeIds = null;
    }
  }
  else {
    filterState.allowedSeIds = null;
    console.log("[Filters] Non-manager/AE user - no default SE mapping");
  }
}

/**
 * Initialize filter state from localStorage
 * Important: We track whether user explicitly chose "All SEs" vs "no saved state"
 * - seFilterMode: "all" = user chose View All, "custom" = user made selections, undefined = first time
 * 
 * NEW: Managers/AEs always start with "My Team" on each new session (not persisted across browser close)
 */
export function loadFilterState(currentUser) {
  console.log("[Filters] Loading filter state for user:", currentUser?.id, currentUser?.email, "role:", currentUser?.role);
  filterState._currentUser = currentUser;
  
  // Load view category
  const savedViewCategory = localStorage.getItem("pocPortal_viewCategory");
  if (savedViewCategory && ["active", "in_review", "completed"].includes(savedViewCategory)) {
    filterState.viewCategory = savedViewCategory;
  } else {
    filterState.viewCategory = "active"; // Default
  }
  console.log("[Filters] View category:", filterState.viewCategory);
  
  // Check if this is a new session (managers/AEs should start with My Team)
  const isNewSession = !sessionStorage.getItem("pocPortal_sessionStarted");
  if (isNewSession) {
    sessionStorage.setItem("pocPortal_sessionStarted", "true");
    console.log("[Filters] New session detected - will apply role defaults for manager/AE");
  }
  
  let hasSavedState = false;
  let seFilterMode = null; // "all", "custom", or null (no saved state)
  
  try {
    const saved = localStorage.getItem("pocPortal_filters_v3");
    if (saved) {
      hasSavedState = true;
      const parsed = JSON.parse(saved);
      filterState.selectedSEs = new Set(parsed.selectedSEs || []);
      filterState.selectedProducts = new Set(parsed.selectedProducts || []);
      filterState.selectedRegions = new Set(parsed.selectedRegions || []);
      filterState.selectedStatuses = new Set(parsed.selectedStatuses || []);
      filterState.searchQuery = parsed.searchQuery || "";
      seFilterMode = parsed.seFilterMode || (filterState.selectedSEs.size > 0 ? "custom" : "all");
      
      console.log("[Filters] Loaded from localStorage:", {
        SEs: filterState.selectedSEs.size,
        products: filterState.selectedProducts.size,
        regions: filterState.selectedRegions.size,
        statuses: filterState.selectedStatuses.size,
        search: filterState.searchQuery,
        seFilterMode: seFilterMode
      });
    }
  } catch (e) {
    console.error("[Filters] Failed to load filter state:", e);
  }
  
  // For managers/AEs with team members: apply role defaults on new session OR if no saved state
  // This ensures they start with "My Team" each time they open the browser
  const isManagerOrAEWithTeam = (currentUser?.role === "manager" || currentUser?.role === "ae") && 
                                 filterState.allowedSeIds?.size > 0;
  
  if (isManagerOrAEWithTeam && (isNewSession || !hasSavedState || seFilterMode === null)) {
    console.log("[Filters] Manager/AE with team - applying role defaults (My Team)");
    applyRoleDefaults(currentUser);
  } else if (!hasSavedState || seFilterMode === null) {
    console.log("[Filters] No saved state - applying role defaults");
    applyRoleDefaults(currentUser);
  } else if (seFilterMode === "all") {
    console.log("[Filters] User previously chose View All - showing all POCs");
    // Keep selectedSEs empty = show all
  } else {
    console.log("[Filters] Using saved custom filter selections");
  }
}

/**
 * Apply role-based default SE selection
 */
function applyRoleDefaults(currentUser) {
  filterState.selectedSEs.clear();
  
  if (currentUser?.role === "se") {
    filterState.selectedSEs.add(currentUser.id);
    console.log("[Filters] SE user - defaulting to own POCs");
  } else if (currentUser?.role === "manager" && filterState.allowedSeIds?.size > 0) {
    filterState.allowedSeIds.forEach(seId => filterState.selectedSEs.add(seId));
    console.log("[Filters] Manager user - defaulting to mapped SEs:", Array.from(filterState.selectedSEs));
  } else if (currentUser?.role === "ae" && filterState.allowedSeIds?.size > 0) {
    filterState.allowedSeIds.forEach(seId => filterState.selectedSEs.add(seId));
    console.log("[Filters] AE user - defaulting to mapped SEs:", Array.from(filterState.selectedSEs));
  }
  // For other roles (pm, admin, etc.): no default = see all POCs
}

/**
 * Save filter state to localStorage
 * Tracks seFilterMode: "all" = showing all POCs, "custom" = specific selections
 */
export function saveFilterState() {
  try {
    // Determine the SE filter mode
    const seFilterMode = filterState.selectedSEs.size === 0 ? "all" : "custom";
    
    localStorage.setItem("pocPortal_filters_v3", JSON.stringify({
      selectedSEs: Array.from(filterState.selectedSEs),
      selectedProducts: Array.from(filterState.selectedProducts),
      selectedRegions: Array.from(filterState.selectedRegions),
      selectedStatuses: Array.from(filterState.selectedStatuses),
      searchQuery: filterState.searchQuery,
      seFilterMode: seFilterMode
    }));
  } catch (e) {
    console.error("[Filters] Failed to save filter state:", e);
  }
}

/**
 * Get current filter state
 */
export function getFilterState() {
  return { ...filterState };
}

/**
 * Set filter change callback
 */
export function setFilterChangeCallback(callback) {
  filterState.onFilterChange = callback;
}

/**
 * Toggle a status filter (called from dashboard)
 */
export function toggleStatusFilter(status) {
  if (filterState.selectedStatuses.has(status)) {
    filterState.selectedStatuses.delete(status);
  } else {
    filterState.selectedStatuses.add(status);
  }
  saveFilterState();
  triggerFilterChange();
}

/**
 * Set a single status filter (clears others first)
 */
export function setStatusFilter(status) {
  filterState.selectedStatuses.clear();
  if (status) {
    filterState.selectedStatuses.add(status);
  }
  saveFilterState();
  triggerFilterChange();
}

/**
 * Clear all status filters
 */
export function clearStatusFilters() {
  filterState.selectedStatuses.clear();
  saveFilterState();
  triggerFilterChange();
}

/**
 * Check if a status is currently filtered
 */
export function isStatusFiltered(status) {
  return filterState.selectedStatuses.has(status);
}

/**
 * Get current status filter (for single-select mode compatibility)
 */
export function getStatusFilter() {
  if (filterState.selectedStatuses.size === 0) return null;
  return Array.from(filterState.selectedStatuses)[0];
}

/**
 * Get all selected statuses
 */
export function getSelectedStatuses() {
  return new Set(filterState.selectedStatuses);
}

/**
 * Trigger filter change
 */
function triggerFilterChange() {
  saveFilterState();
  if (filterState.onFilterChange) {
    filterState.onFilterChange(getFilterState());
  }
}

/**
 * Extract unique values from POCs and users
 */
export function extractFilterOptions(pocs, users, currentUser) {
  const products = new Set();
  const regions = new Set();
  const ses = [];

  console.log("[Filters] ========== EXTRACT FILTER OPTIONS ==========");
  console.log("[Filters] Input: pocs:", pocs.length, "users:", users.length);
  console.log("[Filters] currentUser:", currentUser?.email, "role:", currentUser?.role);
  
  // Debug: log ALL users with their roles
  console.log("[Filters] All users:", users.map(u => ({ 
    id: u.id, 
    role: u.role, 
    email: u.email 
  })));

  // Extract products from POCs
  pocs.forEach(p => {
    if (p.product) products.add(p.product);
  });

  // First pass: collect ALL regions from ALL SE users
  users.forEach(u => {
    if (u.role === "se" && u.region && u.region.trim() !== "") {
      regions.add(u.region);
    }
  });
  
  console.log("[Filters] Regions from all SE users:", Array.from(regions));

  // Get SE IDs that have POCs (for reference, but we show ALL SEs in dropdown)
  const seIdSet = new Set(pocs.map(p => p.se).filter(Boolean));
  console.log("[Filters] Unique SE IDs from current POCs:", seIdSet.size, Array.from(seIdSet));
  
  // Log which users are SEs
  const seUsers = users.filter(u => u.role === "se");
  console.log("[Filters] Users with role=se:", seUsers.length, seUsers.map(u => ({ id: u.id, email: u.email })));

  // IMPORTANT: Show ALL SEs in dropdown (not just ones with POCs in current view)
  // This allows users to filter by any SE, even if they're not seeing their POCs initially
  users.forEach(u => {
    if (u.role === "se") {
      console.log("[Filters] Adding SE to dropdown:", u.email);
      ses.push({
        id: u.id,
        email: u.email,
        name: u.displayName || u.name || u.email,
        region: u.region || ""
      });
    }
  });

  // If still no regions, try to get from POCs
  if (regions.size === 0) {
    pocs.forEach(p => {
      if (p.region && p.region.trim() !== "") {
        regions.add(p.region);
      }
    });
  }

  console.log("[Filters] RESULT: products:", products.size, "regions:", regions.size, "ses:", ses.length);
  console.log("[Filters] SEs in dropdown:", ses.map(s => s.email));
  console.log("[Filters] ========== END EXTRACT ==========");

  const options = {
    products: Array.from(products).sort(),
    regions: Array.from(regions).sort(),
    ses: ses.sort((a, b) => (a.name || "").localeCompare(b.name || ""))
  };
  
  // Cache for later use
  filterState._cachedOptions = options;
  
  return options;
}

/**
 * Render the filter bar
 */
export function renderFilterBar(container, options, currentUser) {
  const { products, regions, ses } = options;

  console.log("[Filters] Rendering filter bar with:", {
    products: products.length,
    regions: regions.length,
    ses: ses.length
  });

  container.innerHTML = `
    <div class="filter-bar">
      <!-- Search -->
      <div class="filter-group filter-search-group">
        <label class="filter-label">
          <span class="filter-icon">🔍</span>
          Search
        </label>
        <input 
          type="text" 
          id="filter-search" 
          class="filter-search-input" 
          placeholder="Search POC name or customer..."
          value="${filterState.searchQuery}"
        >
      </div>

      <!-- SE Filter -->
      <div class="filter-group filter-se-group">
        <label class="filter-label">
          <span class="filter-icon">👤</span>
          SEs
        </label>
        <div class="filter-dropdown-container">
          <button type="button" class="filter-dropdown-btn" id="se-filter-btn">
            ${getSelectedSELabel(ses, currentUser)}
            <span class="filter-dropdown-arrow">▼</span>
          </button>
          <div class="filter-dropdown-menu hidden" id="se-filter-menu">
            <div class="filter-menu-header">
              <button type="button" class="filter-action-btn" data-action="se-all">Select All</button>
              <button type="button" class="filter-action-btn" data-action="se-none">Clear</button>
              ${currentUser && currentUser.role === "se" ? `
                <button type="button" class="filter-action-btn filter-action-primary" data-action="se-mine">My POCs</button>
              ` : ''}
            </div>
            <div class="filter-menu-items" id="se-filter-items">
              ${ses.map(se => `
                <label class="filter-checkbox-item">
                  <input 
                    type="checkbox" 
                    value="${se.id}" 
                    data-filter="se"
                    ${filterState.selectedSEs.size === 0 || filterState.selectedSEs.has(se.id) ? 'checked' : ''}
                  >
                  <span class="filter-checkbox-label">
                    ${se.name}
                    ${se.region ? `<span class="filter-checkbox-region">${se.region}</span>` : ''}
                  </span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Region Filter -->
      <div class="filter-group filter-region-group">
        <label class="filter-label">
          <span class="filter-icon">🌍</span>
          Region
        </label>
        <div class="filter-dropdown-container">
          <button type="button" class="filter-dropdown-btn" id="region-filter-btn">
            ${getSelectedRegionLabel(regions)}
            <span class="filter-dropdown-arrow">▼</span>
          </button>
          <div class="filter-dropdown-menu hidden" id="region-filter-menu">
            <div class="filter-menu-header">
              <button type="button" class="filter-action-btn" data-action="region-all">All</button>
              <button type="button" class="filter-action-btn" data-action="region-none">Clear</button>
            </div>
            <div class="filter-menu-items">
              ${regions.length > 0 ? regions.map(region => `
                <label class="filter-checkbox-item">
                  <input 
                    type="checkbox" 
                    value="${region}" 
                    data-filter="region"
                    ${filterState.selectedRegions.size === 0 || filterState.selectedRegions.has(region) ? 'checked' : ''}
                  >
                  <span class="filter-checkbox-label">${region}</span>
                </label>
              `).join('') : `
                <div class="filter-menu-empty">No regions available</div>
              `}
            </div>
          </div>
        </div>
      </div>

      <!-- Product Filter -->
      <div class="filter-group filter-product-group">
        <label class="filter-label">
          <span class="filter-icon">📦</span>
          Product
        </label>
        <div class="filter-dropdown-container">
          <button type="button" class="filter-dropdown-btn" id="product-filter-btn">
            ${getSelectedProductLabel(products)}
            <span class="filter-dropdown-arrow">▼</span>
          </button>
          <div class="filter-dropdown-menu hidden" id="product-filter-menu">
            <div class="filter-menu-header">
              <button type="button" class="filter-action-btn" data-action="product-all">All</button>
              <button type="button" class="filter-action-btn" data-action="product-none">Clear</button>
            </div>
            <div class="filter-menu-items">
              ${products.length > 0 ? products.map(product => `
                <label class="filter-checkbox-item">
                  <input 
                    type="checkbox" 
                    value="${product}" 
                    data-filter="product"
                    ${filterState.selectedProducts.size === 0 || filterState.selectedProducts.has(product) ? 'checked' : ''}
                  >
                  <span class="filter-checkbox-label">${product}</span>
                </label>
              `).join('') : `
                <div class="filter-menu-empty">No products available</div>
              `}
            </div>
          </div>
        </div>
      </div>

      <!-- Status Filter -->
      <div class="filter-group filter-status-group">
        <label class="filter-label">
          <span class="filter-icon">📊</span>
          Status
        </label>
        <div class="filter-dropdown-container">
          <button type="button" class="filter-dropdown-btn" id="status-filter-btn">
            ${getSelectedStatusLabel()}
            <span class="filter-dropdown-arrow">▼</span>
          </button>
          <div class="filter-dropdown-menu hidden" id="status-filter-menu">
            <div class="filter-menu-header">
              <button type="button" class="filter-action-btn" data-action="status-all">All</button>
              <button type="button" class="filter-action-btn" data-action="status-none">Clear</button>
            </div>
            <div class="filter-menu-items">
              ${renderStatusOptions()}
            </div>
          </div>
        </div>
      </div>

      <!-- Active Filters Summary -->
      <div class="filter-summary" id="filter-summary"></div>

      <!-- Filter Action Buttons -->
      <div class="filter-group filter-actions-group">
        <button type="button" class="filter-view-all-btn" id="filter-view-all-btn" title="Show all POCs from all SEs">
          👁️ All POCs
        </button>
        <button type="button" class="filter-reset-btn" id="filter-reset-btn" title="Show only your assigned POCs (role-based default)">
          🏠 My View
        </button>
      </div>
      
      <!-- POC Count Indicator -->
      <div class="filter-count-indicator" id="filter-count-indicator">
        <span class="filter-count-shown">0</span> / <span class="filter-count-total">0</span> POCs
      </div>
    </div>
  `;

  // Attach event listeners
  attachFilterListeners(container, ses, products, regions, currentUser);
  updateFilterSummary(ses, products, regions);
}

/**
 * Render status filter options
 */
function renderStatusOptions() {
  const statuses = [
    { id: 'on_track', label: 'On Track', icon: '✅', color: 'success' },
    { id: 'at_risk', label: 'At Risk', icon: '⚠️', color: 'warning' },
    { id: 'at_risk_prep', label: 'At Risk (Customer Preparation)', icon: '🎯', color: 'orange' },
    { id: 'at_risk_stalled', label: 'At Risk (Stalled)', icon: '⏸️', color: 'orange' },
    { id: 'overdue', label: 'Overdue', icon: '🔴', color: 'danger' },
    { id: 'in_review', label: 'In Review', icon: '📋', color: 'info' },
    { id: 'this_month', label: 'Completing This Month', icon: '📅', color: 'info' },
    { id: 'next_month', label: 'Completing Next Month', icon: '📅', color: 'info' },
    { id: 'last_month', label: 'Completed Last Month', icon: '✓', color: 'info' }
  ];

  return statuses.map(s => `
    <label class="filter-checkbox-item filter-status-item filter-status-${s.color}">
      <input 
        type="checkbox" 
        value="${s.id}" 
        data-filter="status"
        ${filterState.selectedStatuses.has(s.id) ? 'checked' : ''}
      >
      <span class="filter-checkbox-label">
        <span class="filter-status-icon">${s.icon}</span>
        ${s.label}
      </span>
    </label>
  `).join('');
}

/**
 * Get label for SE filter button
 */
function getSelectedSELabel(ses, currentUser) {
  // No selection = All SEs
  if (filterState.selectedSEs.size === 0) {
    return "All SEs";
  }
  
  // Check if only current user selected (SE viewing their own)
  if (currentUser && filterState.selectedSEs.size === 1 && filterState.selectedSEs.has(currentUser.id)) {
    return "My POCs";
  }
  
  // Check if all SEs in dropdown are selected
  if (filterState.selectedSEs.size === ses.length) {
    return "All SEs";
  }
  
  // Check if manager/AE viewing their team (mapped SEs)
  if (filterState.allowedSeIds && filterState.allowedSeIds.size > 0) {
    const mappedSes = Array.from(filterState.allowedSeIds);
    const selectedSes = Array.from(filterState.selectedSEs);
    
    // Check if selection matches exactly the mapped SEs
    if (mappedSes.length === selectedSes.length && 
        mappedSes.every(id => filterState.selectedSEs.has(id))) {
      return "My Team";
    }
  }
  
  return `${filterState.selectedSEs.size} SE${filterState.selectedSEs.size > 1 ? 's' : ''}`;
}

/**
 * Get label for Region filter button
 */
function getSelectedRegionLabel(regions) {
  if (filterState.selectedRegions.size === 0 || filterState.selectedRegions.size === regions.length) {
    return "All Regions";
  }
  return `${filterState.selectedRegions.size} Region${filterState.selectedRegions.size > 1 ? 's' : ''}`;
}

/**
 * Get label for Product filter button
 */
function getSelectedProductLabel(products) {
  if (filterState.selectedProducts.size === 0 || filterState.selectedProducts.size === products.length) {
    return "All Products";
  }
  return `${filterState.selectedProducts.size} Product${filterState.selectedProducts.size > 1 ? 's' : ''}`;
}

/**
 * Get label for Status filter button
 */
function getSelectedStatusLabel() {
  if (filterState.selectedStatuses.size === 0) {
    return "All Statuses";
  }
  
  const statusLabels = {
    'on_track': 'On Track',
    'at_risk': 'At Risk',
    'at_risk_prep': 'At Risk (Customer Preparation)',
    'at_risk_stalled': 'At Risk (Stalled)',
    'overdue': 'Overdue',
    'in_review': 'In Review',
    'this_month': 'This Month',
    'next_month': 'Next Month',
    'last_month': 'Last Month'
  };
  
  if (filterState.selectedStatuses.size === 1) {
    const status = Array.from(filterState.selectedStatuses)[0];
    return statusLabels[status] || status;
  }
  
  return `${filterState.selectedStatuses.size} Statuses`;
}

/**
 * Attach event listeners
 */
function attachFilterListeners(container, ses, products, regions, currentUser) {
  // Update button active states based on current filter
  const updateViewButtonStates = () => {
    const viewAllBtn = container.querySelector("#filter-view-all-btn");
    const myViewBtn = container.querySelector("#filter-reset-btn");
    
    // Check if we're in "View All" mode (no SE filter)
    const isViewAll = filterState.selectedSEs.size === 0;
    
    // Check if we're in "My View" mode (role defaults)
    let isMyView = false;
    if (currentUser?.role === "se") {
      isMyView = filterState.selectedSEs.size === 1 && filterState.selectedSEs.has(currentUser.id);
    } else if ((currentUser?.role === "manager" || currentUser?.role === "ae") && filterState.allowedSeIds?.size > 0) {
      isMyView = filterState.selectedSEs.size === filterState.allowedSeIds.size &&
                 [...filterState.allowedSeIds].every(id => filterState.selectedSEs.has(id));
    }
    
    if (viewAllBtn) {
      viewAllBtn.classList.toggle("filter-btn-active", isViewAll);
    }
    if (myViewBtn) {
      myViewBtn.classList.toggle("filter-btn-active", isMyView);
    }
  };
  
  // Initial update
  updateViewButtonStates();
  
  // Reset button - resets to role-based defaults
  const resetBtn = container.querySelector("#filter-reset-btn");
  resetBtn?.addEventListener("click", () => {
    console.log("[Filters] Reset clicked - applying role defaults for:", currentUser?.role);
    
    // Clear all filters first
    filterState.selectedSEs.clear();
    filterState.selectedProducts.clear();
    filterState.selectedRegions.clear();
    filterState.selectedStatuses.clear();
    filterState.searchQuery = "";
    
    // Apply role-based SE defaults
    if (currentUser?.role === "se") {
      // SE users: default to their own POCs
      filterState.selectedSEs.add(currentUser.id);
      console.log("[Filters] SE user - defaulting to own POCs");
    } else if (currentUser?.role === "manager" && filterState.allowedSeIds?.size > 0) {
      // Managers: default to their mapped SEs
      filterState.allowedSeIds.forEach(seId => {
        filterState.selectedSEs.add(seId);
      });
      console.log("[Filters] Manager - defaulting to mapped SEs:", Array.from(filterState.selectedSEs));
    } else if (currentUser?.role === "ae" && filterState.allowedSeIds?.size > 0) {
      // AEs: default to their mapped SEs
      filterState.allowedSeIds.forEach(seId => {
        filterState.selectedSEs.add(seId);
      });
      console.log("[Filters] AE - defaulting to mapped SEs:", Array.from(filterState.selectedSEs));
    }
    // For other roles (pm, admin, etc.): no SE filter = see all POCs
    
    // Clear search input
    const searchInput = container.querySelector("#filter-search");
    if (searchInput) searchInput.value = "";
    
    // Save and update UI
    saveFilterState();
    updateCheckboxes(container, ses, products, regions);
    updateDropdownLabels(container, ses, products, regions, currentUser);
    updateFilterSummary(ses, products, regions);
    updateDashboardActiveStates();
    updateViewButtonStates();
    triggerFilterChange();
  });

  // View All button - clears ALL filters to show everything
  const viewAllBtn = container.querySelector("#filter-view-all-btn");
  viewAllBtn?.addEventListener("click", () => {
    console.log("[Filters] View All clicked - clearing all filters");
    
    // Clear ALL filters including SE filter
    filterState.selectedSEs.clear();
    filterState.selectedProducts.clear();
    filterState.selectedRegions.clear();
    filterState.selectedStatuses.clear();
    filterState.searchQuery = "";
    
    // Clear search input
    const searchInput = container.querySelector("#filter-search");
    if (searchInput) searchInput.value = "";
    
    // Save and update UI
    saveFilterState();
    updateCheckboxes(container, ses, products, regions);
    updateDropdownLabels(container, ses, products, regions, currentUser);
    updateFilterSummary(ses, products, regions);
    updateDashboardActiveStates();
    updateViewButtonStates();
    triggerFilterChange();
  });

  // Search input with debounce
  const searchInput = container.querySelector("#filter-search");
  let searchTimeout;
  searchInput?.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filterState.searchQuery = e.target.value.trim();
      updateFilterSummary(ses, products, regions);
      triggerFilterChange();
    }, 300);
  });

  // Dropdown toggles
  const dropdownBtns = container.querySelectorAll(".filter-dropdown-btn");
  dropdownBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = btn.nextElementSibling;
      const wasHidden = menu.classList.contains("hidden");
      
      // Close all menus
      container.querySelectorAll(".filter-dropdown-menu").forEach(m => m.classList.add("hidden"));
      
      // Toggle this one
      if (wasHidden) {
        menu.classList.remove("hidden");
      }
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener("click", () => {
    container.querySelectorAll(".filter-dropdown-menu").forEach(m => m.classList.add("hidden"));
  });

  // Prevent closing when clicking inside dropdown
  container.querySelectorAll(".filter-dropdown-menu").forEach(menu => {
    menu.addEventListener("click", e => e.stopPropagation());
  });

  // Action buttons
  container.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;

      switch (action) {
        case "se-all":
          filterState.selectedSEs.clear();
          break;
        case "se-none":
          filterState.selectedSEs.clear();
          // For "none", we want to show no POCs - set an impossible filter
          filterState.selectedSEs.add("__none__");
          break;
        case "se-mine":
          filterState.selectedSEs.clear();
          if (currentUser) filterState.selectedSEs.add(currentUser.id);
          break;
        case "region-all":
          filterState.selectedRegions.clear();
          break;
        case "region-none":
          filterState.selectedRegions.clear();
          filterState.selectedRegions.add("__none__");
          break;
        case "product-all":
          filterState.selectedProducts.clear();
          break;
        case "product-none":
          filterState.selectedProducts.clear();
          filterState.selectedProducts.add("__none__");
          break;
        case "status-all":
          filterState.selectedStatuses.clear();
          updateDashboardActiveStates();
          break;
        case "status-none":
          filterState.selectedStatuses.clear();
          updateDashboardActiveStates();
          break;
      }

      updateCheckboxes(container, ses, products, regions);
      updateDropdownLabels(container, ses, products, regions, currentUser);
      updateFilterSummary(ses, products, regions);
      triggerFilterChange();
    });
  });

  // Checkbox changes - SE
  container.querySelectorAll("input[data-filter='se']").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      // Remove the "none" placeholder if present
      filterState.selectedSEs.delete("__none__");
      
      if (checkbox.checked) {
        // If previously "all" (empty set), start tracking individual selections
        if (filterState.selectedSEs.size === 0) {
          ses.forEach(s => filterState.selectedSEs.add(s.id));
        }
        filterState.selectedSEs.add(checkbox.value);
      } else {
        // If unchecking from "all" state, first populate with all then remove
        if (filterState.selectedSEs.size === 0) {
          ses.forEach(s => filterState.selectedSEs.add(s.id));
        }
        filterState.selectedSEs.delete(checkbox.value);
        
        // If all unchecked, go back to empty (show all)
        if (filterState.selectedSEs.size === 0 || 
            (filterState.selectedSEs.size === ses.length)) {
          filterState.selectedSEs.clear();
        }
      }

      updateDropdownLabels(container, ses, products, regions, currentUser);
      updateFilterSummary(ses, products, regions);
      triggerFilterChange();
    });
  });

  // Checkbox changes - Region
  container.querySelectorAll("input[data-filter='region']").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      filterState.selectedRegions.delete("__none__");
      
      if (checkbox.checked) {
        if (filterState.selectedRegions.size === 0) {
          regions.forEach(r => filterState.selectedRegions.add(r));
        }
        filterState.selectedRegions.add(checkbox.value);
      } else {
        if (filterState.selectedRegions.size === 0) {
          regions.forEach(r => filterState.selectedRegions.add(r));
        }
        filterState.selectedRegions.delete(checkbox.value);
        
        if (filterState.selectedRegions.size === 0 || 
            filterState.selectedRegions.size === regions.length) {
          filterState.selectedRegions.clear();
        }
      }

      updateDropdownLabels(container, ses, products, regions, currentUser);
      updateFilterSummary(ses, products, regions);
      triggerFilterChange();
    });
  });

  // Checkbox changes - Product
  container.querySelectorAll("input[data-filter='product']").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      filterState.selectedProducts.delete("__none__");
      
      if (checkbox.checked) {
        if (filterState.selectedProducts.size === 0) {
          products.forEach(p => filterState.selectedProducts.add(p));
        }
        filterState.selectedProducts.add(checkbox.value);
      } else {
        if (filterState.selectedProducts.size === 0) {
          products.forEach(p => filterState.selectedProducts.add(p));
        }
        filterState.selectedProducts.delete(checkbox.value);
        
        if (filterState.selectedProducts.size === 0 || 
            filterState.selectedProducts.size === products.length) {
          filterState.selectedProducts.clear();
        }
      }

      updateDropdownLabels(container, ses, products, regions, currentUser);
      updateFilterSummary(ses, products, regions);
      triggerFilterChange();
    });
  });

  // Checkbox changes - Status
  container.querySelectorAll("input[data-filter='status']").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        filterState.selectedStatuses.add(checkbox.value);
      } else {
        filterState.selectedStatuses.delete(checkbox.value);
      }

      updateDropdownLabels(container, ses, products, regions, currentUser);
      updateFilterSummary(ses, products, regions);
      updateDashboardActiveStates();
      triggerFilterChange();
    });
  });
}

/**
 * Update dashboard card active states based on filter
 */
function updateDashboardActiveStates() {
  document.querySelectorAll(".dashboard-card").forEach(card => {
    const status = card.dataset.status;
    if (filterState.selectedStatuses.has(status)) {
      card.classList.add("dashboard-card-active");
    } else {
      card.classList.remove("dashboard-card-active");
    }
  });
}

/**
 * Update checkbox states
 */
function updateCheckboxes(container, ses, products, regions) {
  container.querySelectorAll("input[data-filter='se']").forEach(checkbox => {
    checkbox.checked = filterState.selectedSEs.size === 0 || filterState.selectedSEs.has(checkbox.value);
  });
  
  container.querySelectorAll("input[data-filter='region']").forEach(checkbox => {
    checkbox.checked = filterState.selectedRegions.size === 0 || filterState.selectedRegions.has(checkbox.value);
  });
  
  container.querySelectorAll("input[data-filter='product']").forEach(checkbox => {
    checkbox.checked = filterState.selectedProducts.size === 0 || filterState.selectedProducts.has(checkbox.value);
  });

  container.querySelectorAll("input[data-filter='status']").forEach(checkbox => {
    checkbox.checked = filterState.selectedStatuses.has(checkbox.value);
  });
}

/**
 * Update dropdown button labels
 */
function updateDropdownLabels(container, ses, products, regions, currentUser) {
  const seBtn = container.querySelector("#se-filter-btn");
  if (seBtn) {
    seBtn.innerHTML = `${getSelectedSELabel(ses, currentUser)}<span class="filter-dropdown-arrow">▼</span>`;
  }

  const regionBtn = container.querySelector("#region-filter-btn");
  if (regionBtn) {
    regionBtn.innerHTML = `${getSelectedRegionLabel(regions)}<span class="filter-dropdown-arrow">▼</span>`;
  }

  const productBtn = container.querySelector("#product-filter-btn");
  if (productBtn) {
    productBtn.innerHTML = `${getSelectedProductLabel(products)}<span class="filter-dropdown-arrow">▼</span>`;
  }

  const statusBtn = container.querySelector("#status-filter-btn");
  if (statusBtn) {
    statusBtn.innerHTML = `${getSelectedStatusLabel()}<span class="filter-dropdown-arrow">▼</span>`;
  }
}

/**
 * Update filter summary chips
 */
function updateFilterSummary(ses, products, regions) {
  const summary = document.getElementById("filter-summary");
  if (!summary) return;

  const chips = [];

  // Search chip
  if (filterState.searchQuery) {
    chips.push(`<span class="filter-chip">Search: "${filterState.searchQuery}" <button data-clear="search">×</button></span>`);
  }

  // Status chips
  if (filterState.selectedStatuses.size > 0) {
    const statusLabels = {
      'on_track': '✅ On Track',
      'at_risk': '⚠️ At Risk',
      'at_risk_prep': '🎯 At Risk (Customer Preparation)',
      'at_risk_stalled': '⏸️ At Risk (Stalled)',
      'overdue': '🔴 Overdue',
      'in_review': '📋 In Review',
      'this_month': '📅 This Month',
      'next_month': '📅 Next Month',
      'last_month': '✓ Last Month'
    };
    
    filterState.selectedStatuses.forEach(status => {
      chips.push(`<span class="filter-chip filter-chip-status">${statusLabels[status] || status} <button data-clear="status" data-status="${status}">×</button></span>`);
    });
  }

  // SE chips (only show if not all selected)
  if (filterState.selectedSEs.size > 0 && filterState.selectedSEs.size < ses.length && !filterState.selectedSEs.has("__none__")) {
    const count = filterState.selectedSEs.size;
    chips.push(`<span class="filter-chip filter-chip-se">${count} SE${count > 1 ? 's' : ''} <button data-clear="se">×</button></span>`);
  }

  // Region chips
  if (filterState.selectedRegions.size > 0 && !filterState.selectedRegions.has("__none__")) {
    const count = filterState.selectedRegions.size;
    chips.push(`<span class="filter-chip filter-chip-region">${count} Region${count > 1 ? 's' : ''} <button data-clear="region">×</button></span>`);
  }

  // Product chips
  if (filterState.selectedProducts.size > 0 && !filterState.selectedProducts.has("__none__")) {
    const count = filterState.selectedProducts.size;
    chips.push(`<span class="filter-chip filter-chip-product">${count} Product${count > 1 ? 's' : ''} <button data-clear="product">×</button></span>`);
  }

  summary.innerHTML = chips.join("");

  // Attach clear handlers
  summary.querySelectorAll("button[data-clear]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const clearType = btn.dataset.clear;
      
      switch (clearType) {
        case "search":
          filterState.searchQuery = "";
          const searchInput = document.getElementById("filter-search");
          if (searchInput) searchInput.value = "";
          break;
        case "status":
          const statusToClear = btn.dataset.status;
          if (statusToClear) {
            filterState.selectedStatuses.delete(statusToClear);
          } else {
            filterState.selectedStatuses.clear();
          }
          updateDashboardActiveStates();
          // Update status checkboxes
          document.querySelectorAll("input[data-filter='status']").forEach(cb => {
            cb.checked = filterState.selectedStatuses.has(cb.value);
          });
          break;
        case "se":
          filterState.selectedSEs.clear();
          break;
        case "region":
          filterState.selectedRegions.clear();
          break;
        case "product":
          filterState.selectedProducts.clear();
          break;
      }

      const container = document.getElementById("filter-section");
      if (container) {
        updateCheckboxes(container, ses, products, regions);
        updateDropdownLabels(container, ses, products, regions, filterState._currentUser);
      }
      updateFilterSummary(ses, products, regions);
      triggerFilterChange();
    });
  });
}

/**
 * Update the POC count indicator showing filtered/total
 */
export function updatePocCountIndicator(filteredCount, totalCount) {
  const indicator = document.getElementById("filter-count-indicator");
  if (!indicator) return;
  
  const shownSpan = indicator.querySelector(".filter-count-shown");
  const totalSpan = indicator.querySelector(".filter-count-total");
  
  if (shownSpan) shownSpan.textContent = filteredCount;
  if (totalSpan) totalSpan.textContent = totalCount;
  
  // Add visual indication when filtered
  if (filteredCount < totalCount) {
    indicator.classList.add("filter-count-filtered");
  } else {
    indicator.classList.remove("filter-count-filtered");
  }
}

/**
 * Refresh the filter summary (called after status filter changes from dashboard)
 */
export function refreshFilterSummary() {
  const options = filterState._cachedOptions;
  if (options) {
    updateFilterSummary(options.ses, options.products, options.regions);
    
    // Also update the status dropdown checkboxes
    document.querySelectorAll("input[data-filter='status']").forEach(cb => {
      cb.checked = filterState.selectedStatuses.has(cb.value);
    });
    
    // Update status button label
    const statusBtn = document.querySelector("#status-filter-btn");
    if (statusBtn) {
      statusBtn.innerHTML = `${getSelectedStatusLabel()}<span class="filter-dropdown-arrow">▼</span>`;
    }
  }
}

/**
 * Apply filters to POC list
 * NOTE: Everyone can see ALL POCs - filtering is based on user selection only
 */
/**
 * Apply all filters EXCEPT view category - used for dashboard counts
 */
export function applyBaseFilters(pocs, users, pocUseCasesMap, asOfDate) {
  return pocs.filter(p => {
    // Skip deregistered POCs - they should not appear anywhere
    if (p.deregistered_at) return false;

    // SE filter
    if (filterState.selectedSEs.size > 0) {
      if (filterState.selectedSEs.has("__none__")) return false;
      if (!filterState.selectedSEs.has(p.se)) return false;
    }

    // Region filter
    if (filterState.selectedRegions.size > 0) {
      if (filterState.selectedRegions.has("__none__")) return false;
      const se = users.find(u => u.id === p.se);
      if (!se || !filterState.selectedRegions.has(se.region)) return false;
    }

    // Product filter
    if (filterState.selectedProducts.size > 0) {
      if (filterState.selectedProducts.has("__none__")) return false;
      if (!filterState.selectedProducts.has(p.product)) return false;
    }

    // Search filter
    if (filterState.searchQuery) {
      const query = filterState.searchQuery.toLowerCase();
      const customerName = (p.customer_name || "").toLowerCase();
      const name = (p.name || "").toLowerCase();
      const partner = (p.partner || "").toLowerCase();
      const product = (p.product || "").toLowerCase();
      
      if (!customerName.includes(query) && !name.includes(query) && !partner.includes(query) && !product.includes(query)) {
        return false;
      }
    }

    return true;
  });
}

export function applyFilters(pocs, users, pocUseCasesMap, asOfDate) {
  console.log("[Filters] Applying filters to", pocs.length, "POCs");
  console.log("[Filters] View category:", filterState.viewCategory, "| Selected SEs:", filterState.selectedSEs.size);

  const filtered = pocs.filter(p => {
    // Skip deregistered POCs - they should not appear anywhere
    if (p.deregistered_at) return false;

    // View category filter - this is the PRIMARY filter
    if (pocUseCasesMap && asOfDate) {
      const pocUcs = pocUseCasesMap.get(p.id) || [];
      const categorized = categorizePoc(p, pocUcs, asOfDate);
      
      switch (filterState.viewCategory) {
        case 'active':
          if (!categorized.isActive) return false;
          break;
        case 'in_review':
          if (!categorized.isInReview) return false;
          break;
        case 'completed':
          if (!categorized.isCompleted) return false;
          break;
      }
    }

    // SE filter - if no SEs selected, show ALL POCs
    if (filterState.selectedSEs.size > 0) {
      if (filterState.selectedSEs.has("__none__")) return false;
      if (!filterState.selectedSEs.has(p.se)) return false;
    }

    // Region filter (need to look up SE's region)
    if (filterState.selectedRegions.size > 0) {
      if (filterState.selectedRegions.has("__none__")) return false;
      const se = users.find(u => u.id === p.se);
      if (!se || !filterState.selectedRegions.has(se.region)) {
        return false;
      }
    }

    // Product filter
    if (filterState.selectedProducts.size > 0) {
      if (filterState.selectedProducts.has("__none__")) return false;
      if (!filterState.selectedProducts.has(p.product)) return false;
    }

    // Search filter
    if (filterState.searchQuery) {
      const query = filterState.searchQuery.toLowerCase();
      const customerName = (p.customer_name || "").toLowerCase();
      const name = (p.name || "").toLowerCase();
      const partner = (p.partner || "").toLowerCase();
      const product = (p.product || "").toLowerCase();
      
      if (!customerName.includes(query) && !name.includes(query) && !partner.includes(query) && !product.includes(query)) {
        return false;
      }
    }

    // Status filter (uses POC status calculation) - only applies to Active view
    if (filterState.viewCategory === 'active' && filterState.selectedStatuses.size > 0 && pocUseCasesMap && asOfDate) {
      const pocUcs = pocUseCasesMap.get(p.id) || [];
      const categorized = categorizePoc(p, pocUcs, asOfDate);
      
      let matchesAnyStatus = false;
      
      for (const status of filterState.selectedStatuses) {
        switch (status) {
          case 'on_track':
            if (categorized.isOnTrack && categorized.isActive) matchesAnyStatus = true;
            break;
          case 'at_risk':
            if (categorized.isAtRisk && !categorized.isAtRiskPrep && !categorized.isAtRiskStalled && categorized.isActive) matchesAnyStatus = true;
            break;
          case 'at_risk_prep':
            if (categorized.isAtRiskPrep && categorized.isActive) matchesAnyStatus = true;
            break;
          case 'at_risk_stalled':
            if (categorized.isAtRiskStalled && categorized.isActive) matchesAnyStatus = true;
            break;
          case 'overdue':
            if (categorized.isOverdue && categorized.isActive) matchesAnyStatus = true;
            break;
          case 'in_review':
            if (categorized.isInReview) matchesAnyStatus = true;
            break;
          case 'this_month':
            const now = asOfDate;
            const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const pocEnd = p.poc_end_date_plan || p.poc_end_date;
            if (pocEnd) {
              const endDate = new Date(pocEnd);
              if (endDate >= thisMonthStart && endDate < nextMonthStart && (categorized.isActive || categorized.isInReview)) {
                matchesAnyStatus = true;
              }
            }
            break;
          case 'next_month':
            const now2 = asOfDate;
            const nextMonthStart2 = new Date(now2.getFullYear(), now2.getMonth() + 1, 1);
            const nextMonthEnd = new Date(now2.getFullYear(), now2.getMonth() + 2, 0);
            const pocEnd2 = p.poc_end_date_plan || p.poc_end_date;
            if (pocEnd2) {
              const endDate2 = new Date(pocEnd2);
              if (endDate2 >= nextMonthStart2 && endDate2 <= nextMonthEnd && (categorized.isActive || categorized.isInReview)) {
                matchesAnyStatus = true;
              }
            }
            break;
          case 'last_month':
            if (categorized.isCompleted) {
              const now3 = asOfDate;
              const lastMonthStart = new Date(now3.getFullYear(), now3.getMonth() - 1, 1);
              const lastMonthEnd = new Date(now3.getFullYear(), now3.getMonth(), 0);
              const pocEnd3 = p.poc_end_date_plan || p.poc_end_date;
              if (pocEnd3) {
                const endDate3 = new Date(pocEnd3);
                if (endDate3 >= lastMonthStart && endDate3 <= lastMonthEnd) {
                  matchesAnyStatus = true;
                }
              }
            }
            break;
        }
        
        if (matchesAnyStatus) break;
      }
      
      if (!matchesAnyStatus) return false;
    }

    return true;
  });

  console.log("[Filters] Filtered result:", filtered.length, "POCs");
  return filtered;
}