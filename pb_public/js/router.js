// router.js - Hash-based routing for POC Portal
// Provides bookmarkable URLs and browser history support

console.log("[Router] VERSION 1.0 - Hash-based navigation");

/**
 * Router state
 */
const routerState = {
  initialized: false,
  currentRoute: null,
  handlers: {},
  onNavigate: null
};

/**
 * Route patterns
 */
const ROUTES = {
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
  DASHBOARD_VIEW: "/dashboard/:view", // active, in_review, completed
  EXEC: "/exec",
  POC_DETAIL: "/poc/:id",
  USECASE_DETAIL: "/usecase/:id"
};

/**
 * Parse the current hash into route info
 * @returns {object} { path, params }
 */
export function getCurrentRoute() {
  const hash = window.location.hash.slice(1) || "/dashboard";
  const parts = hash.split("/").filter(Boolean);

  // Parse route patterns
  if (parts[0] === "login") {
    return { path: ROUTES.LOGIN, params: {} };
  }

  if (parts[0] === "exec") {
    return { path: ROUTES.EXEC, params: {} };
  }

  if (parts[0] === "poc" && parts[1]) {
    return { path: ROUTES.POC_DETAIL, params: { id: parts[1] } };
  }

  if (parts[0] === "usecase" && parts[1]) {
    return { path: ROUTES.USECASE_DETAIL, params: { id: parts[1] } };
  }

  if (parts[0] === "dashboard") {
    if (parts[1] && ["active", "in_review", "completed"].includes(parts[1])) {
      return { path: ROUTES.DASHBOARD_VIEW, params: { view: parts[1] } };
    }
    return { path: ROUTES.DASHBOARD, params: { view: "active" } };
  }

  // Default to dashboard
  return { path: ROUTES.DASHBOARD, params: { view: "active" } };
}

/**
 * Navigate to a route
 * @param {string} route - Route path (e.g., "#/dashboard/active", "#/exec")
 * @param {boolean} replace - If true, replace current history entry
 */
export function navigateTo(route, replace = false) {
  // Ensure route starts with #
  const hash = route.startsWith("#") ? route : `#${route}`;

  console.log("[Router] Navigating to:", hash);

  if (replace) {
    window.history.replaceState(null, "", hash);
    handleRouteChange();
  } else {
    window.location.hash = hash;
  }
}

/**
 * Navigate to dashboard with specific view
 * @param {string} view - View category: 'active', 'in_review', 'completed'
 */
export function navigateToDashboard(view = "active") {
  navigateTo(`/dashboard/${view}`);
}

/**
 * Navigate to executive dashboard
 */
export function navigateToExec() {
  navigateTo("/exec");
}

/**
 * Navigate to POC detail
 * @param {string} pocId - POC ID
 */
export function navigateToPocDetail(pocId) {
  navigateTo(`/poc/${pocId}`);
}

/**
 * Navigate to use case detail
 * @param {string} ucId - Use case ID
 */
export function navigateToUseCaseDetail(ucId) {
  navigateTo(`/usecase/${ucId}`);
}

/**
 * Handle route changes
 */
function handleRouteChange() {
  const route = getCurrentRoute();

  if (routerState.currentRoute?.path === route.path &&
      JSON.stringify(routerState.currentRoute?.params) === JSON.stringify(route.params)) {
    return; // No change
  }

  routerState.currentRoute = route;
  console.log("[Router] Route changed:", route);

  // Call the navigation handler if set
  if (routerState.onNavigate) {
    routerState.onNavigate(route);
  }
}

/**
 * Set the navigation handler
 * @param {function} handler - Function called on route change with route info
 */
export function setNavigationHandler(handler) {
  routerState.onNavigate = handler;
}

/**
 * Initialize the router
 * Call this after the app is ready to handle navigation
 */
export function initRouter() {
  if (routerState.initialized) {
    // Already initialized - return current route for callers that need it
    return routerState.currentRoute || getCurrentRoute();
  }

  console.log("[Router] Initializing...");

  // Listen for hash changes
  window.addEventListener("hashchange", handleRouteChange);

  // Handle initial route
  routerState.initialized = true;

  // Process current hash
  const route = getCurrentRoute();
  routerState.currentRoute = route;

  console.log("[Router] Initial route:", route);

  return route;
}

/**
 * Get the current view category from route
 * @returns {string} View category: 'active', 'in_review', 'completed'
 */
export function getRouteViewCategory() {
  const route = getCurrentRoute();
  if (route.path === ROUTES.DASHBOARD_VIEW) {
    return route.params.view;
  }
  return "active";
}

/**
 * Check if current route is executive dashboard
 * @returns {boolean}
 */
export function isExecRoute() {
  return getCurrentRoute().path === ROUTES.EXEC;
}

/**
 * Check if current route is a detail view
 * @returns {boolean}
 */
export function isDetailRoute() {
  const route = getCurrentRoute();
  return route.path === ROUTES.POC_DETAIL || route.path === ROUTES.USECASE_DETAIL;
}

// Export route constants
export { ROUTES };
