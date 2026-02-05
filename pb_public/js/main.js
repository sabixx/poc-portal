// main.js - Entry point for POC Portal
// VERSION 2.1 - Session persistence + Logout + Settings + Create POC
import { appState, loadSelectedSe } from "./state.js";
import { initPocketBase, loginUser, fetchAllData, fetchAllComments, fetchAllFeatureRequests } from "./api.js";
import {
  initOverview,
  renderMainView,
  buildVisibleSEs,
  renderSeFilters,
} from "./overview.js";
import { setupPocDetail, refreshPocDetailIfVisible } from "./poc_detail.js";
import { setupUcDetail, refreshUcDetailIfVisible } from "./uc_detail.js";
import { renderUseCaseStats } from "./overview_stats.js";
import { initLoadingOverlay, showLoading, hideLoading } from "./loading.js";
import { showSettingsModal } from "./settings.js";
import { initExecDashboard, refreshExecDashboard } from "./exec_dashboard.js";
import { showCreatePocModal } from "./create_poc_modal.js";
import {
  initRouter,
  setNavigationHandler,
  getCurrentRoute,
  navigateTo,
  navigateToDashboard,
  ROUTES
} from "./router.js";
import { setViewCategory, getViewCategory } from "./filters.js";

console.log("[POC-PORTAL] main.js VERSION 0.0.8 - Navigation fixes");

//const PB_BASE = "http://172.17.32.15:8090"; // adjust if needed
//const PB_BASE = "https://pocinsights.mimlab.io"; 
const PB_BASE = window.location.origin;

const loginSection = document.getElementById("login-section");
const portalSection = document.getElementById("portal-section");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userInfo = document.getElementById("user-info");
const roleHint = document.getElementById("role-hint");

/**
 * PocketBase realtime subscriptions — auto-refresh on data changes
 * Must be called after authentication so SSE connection has valid auth token
 */
let realtimeDebounce = null;
function setupRealtimeSubscriptions(pb) {
  const debouncedRefresh = () => {
    clearTimeout(realtimeDebounce);
    realtimeDebounce = setTimeout(() => window.refreshPocList(false), 500);
  };
  ['pocs', 'poc_use_cases', 'comments', 'poc_feature_requests'].forEach(col => {
    pb.collection(col).subscribe('*', debouncedRefresh);
  });
  console.log("[POC-PORTAL] Realtime subscriptions active");
}

/**
 * Load all data and initialize the portal after authentication
 */
async function initializePortal(pb, user) {
  appState.currentUser = user;
  
  // Update UI
  userInfo.innerHTML = `Signed in as: ${user.email} (${user.role})`;
  loginSection.classList.add("hidden");
  portalSection.classList.remove("hidden");
  
  // Show header and navigation elements
  document.getElementById("app-header")?.classList.remove("hidden");
  document.getElementById("logout-btn")?.classList.remove("hidden");
  document.getElementById("settings-btn")?.classList.remove("hidden");
  document.getElementById("header-nav")?.classList.remove("hidden");
  document.getElementById("create-poc-btn")?.classList.remove("hidden");
  document.getElementById("refresh-btn")?.classList.remove("hidden");

  // Update loading message
  showLoading("Loading data...", "Fetching POCs and users");

  loadSelectedSe();

  const { users, pocs, puc, roleText } = await fetchAllData(pb, user);
  appState.allUsers = users;
  appState.allPocs = pocs;
  appState.allPuc = puc;

  // Batch fetch comments and feature requests
  showLoading("Loading comments...", "Fetching feedback data");
  const [allComments, allFeatureRequests] = await Promise.all([
    fetchAllComments(pb),
    fetchAllFeatureRequests(pb, pocs)  // Pass pocs for per-POC fetching
  ]);
  appState.allComments = allComments;
  appState.allFeatureRequests = allFeatureRequests;
  
  // Pre-index comments by POC and use case (clear existing and repopulate)
  appState.commentsByPoc.clear();
  appState.commentsByPuc.clear();
  allComments.forEach(c => {
    if (c.poc) {
      if (!appState.commentsByPoc.has(c.poc)) {
        appState.commentsByPoc.set(c.poc, []);
      }
      appState.commentsByPoc.get(c.poc).push(c);
    }
    if (c.poc_use_case) {
      const pucIds = Array.isArray(c.poc_use_case) ? c.poc_use_case : [c.poc_use_case];
      pucIds.forEach(pucId => {
        if (!appState.commentsByPuc.has(pucId)) {
          appState.commentsByPuc.set(pucId, []);
        }
        appState.commentsByPuc.get(pucId).push(c);
      });
    }
  });
  // Pre-index feature requests by POC (clear existing and repopulate)
  appState.featureRequestsByPoc.clear();
  allFeatureRequests.forEach(fr => {
    if (fr.poc) {
      if (!appState.featureRequestsByPoc.has(fr.poc)) {
        appState.featureRequestsByPoc.set(fr.poc, []);
      }
      appState.featureRequestsByPoc.get(fr.poc).push(fr);
    }
  });
  if (roleHint) {
    roleHint.textContent = roleText;
  }

  // Update loading message
  showLoading("Initializing...", "Setting up filters");

  // Initialize filters and render main view
  const visibleSEs = buildVisibleSEs();
  await renderSeFilters(visibleSEs);
  await renderMainView();

  // Hide loading overlay when done
  hideLoading(true);

  // Setup executive dashboard navigation
  setupExecDashboardNav();

  // Initialize router and set up navigation handler
  setNavigationHandler(handleNavigation);
  const initialRoute = initRouter();

  // Handle initial route (e.g., if user navigated directly to #/exec)
  if (initialRoute && initialRoute.path !== ROUTES.DASHBOARD && initialRoute.path !== ROUTES.DASHBOARD_VIEW) {
    handleNavigation(initialRoute);
  } else if (initialRoute && initialRoute.params.view && initialRoute.params.view !== "active") {
    // If URL has a specific view, apply it
    setViewCategory(initialRoute.params.view, true);
  }

  // Setup realtime subscriptions after authentication
  setupRealtimeSubscriptions(pb);
}

/**
 * Setup executive dashboard navigation handlers
 */
function setupExecDashboardNav() {
  const execBtn = document.getElementById("exec-dashboard-btn");
  const execBackBtn = document.getElementById("exec-back-btn");

  // Open executive dashboard - use router
  if (execBtn) {
    execBtn.addEventListener("click", () => {
      navigateTo("/exec");
    });
  }

  // Back to portal - use router
  if (execBackBtn) {
    execBackBtn.addEventListener("click", () => {
      navigateToDashboard(getViewCategory());
    });
  }
}

/**
 * Handle route navigation - switches views based on current route
 */
function handleNavigation(route) {

  // Force-hide any loading overlay that might be blocking the view
  hideLoading(true);

  const portalSection = document.getElementById("portal-section");
  const execSection = document.getElementById("exec-dashboard-section");
  const pocDetailSection = document.getElementById("poc-detail-section");
  const usecaseDetailSection = document.getElementById("usecase-detail-section");

  // Hide all sections first
  pocDetailSection?.classList.add("hidden");
  usecaseDetailSection?.classList.add("hidden");

  // Scroll to top on navigation
  window.scrollTo(0, 0);

  switch (route.path) {
    case ROUTES.EXEC:
      portalSection?.classList.add("hidden");
      execSection?.classList.remove("hidden");
      try {
        initExecDashboard();
      } catch (err) {
        console.error("[POC-PORTAL] Error initializing exec dashboard:", err);
      }
      updateHeaderNav("exec");
      break;

    case ROUTES.DASHBOARD:
    case ROUTES.DASHBOARD_VIEW:
      execSection?.classList.add("hidden");
      portalSection?.classList.remove("hidden");
      // Update view category without triggering another URL change
      const viewCategory = route.params.view || "active";
      if (getViewCategory() !== viewCategory) {
        setViewCategory(viewCategory, true); // true = skip URL update
      }
      updateHeaderNav("dashboard");
      break;

    case ROUTES.POC_DETAIL:
      // POC detail handled by showPocDetail - this is for direct URL access
      execSection?.classList.add("hidden");
      portalSection?.classList.add("hidden");
      pocDetailSection?.classList.remove("hidden");
      updateHeaderNav("dashboard");
      break;

    case ROUTES.USECASE_DETAIL:
      // Use case detail handled by showUseCaseDetail
      execSection?.classList.add("hidden");
      portalSection?.classList.add("hidden");
      usecaseDetailSection?.classList.remove("hidden");
      updateHeaderNav("dashboard");
      break;
  }
}

/**
 * Update header navigation active state
 */
function updateHeaderNav(activeRoute) {
  const navItems = document.querySelectorAll(".header-nav .nav-item");
  navItems.forEach(item => {
    const route = item.dataset.route;
    if (route === activeRoute) {
      item.classList.add("nav-item--active");
    } else {
      item.classList.remove("nav-item--active");
    }
  });
}

/**
 * Handle logout
 */
function handleLogout() {
  console.log("[POC-PORTAL] Logging out...");

  try {
    appState.pb.realtime.disconnect();
  } catch (e) {
    console.warn("[POC-PORTAL] Error disconnecting realtime:", e);
  }
  try {
    appState.pb.authStore.clear();
  } catch (e) {
    console.warn("[POC-PORTAL] Error clearing auth store:", e);
  }
  appState.currentUser = null;

  // Clear session storage so next login starts fresh
  sessionStorage.removeItem("pocPortal_sessionStarted");

  // Reset UI - hide everything auth-related first
  document.getElementById("app-header")?.classList.add("hidden");
  document.getElementById("logout-btn")?.classList.add("hidden");
  document.getElementById("settings-btn")?.classList.add("hidden");
  document.getElementById("header-nav")?.classList.add("hidden");
  document.getElementById("create-poc-btn")?.classList.add("hidden");
  document.getElementById("refresh-btn")?.classList.add("hidden");
  portalSection.classList.add("hidden");
  document.getElementById("exec-dashboard-section")?.classList.add("hidden");
  document.getElementById("poc-detail-section")?.classList.add("hidden");
  document.getElementById("usecase-detail-section")?.classList.add("hidden");

  // Show login
  loginSection.classList.remove("hidden");
  userInfo.textContent = "Not signed in";

  // Clear form
  document.getElementById("login-email").value = "";
  document.getElementById("login-password").value = "";
}

document.addEventListener("DOMContentLoaded", async () => {
  const pb = initPocketBase(PB_BASE);
  if (!pb) return;
  appState.pb = pb;

  // Initialize loading overlay
  initLoadingOverlay();

  // Initialize Lucide icons for static header elements
  if (window.lucide) {
    lucide.createIcons();
  }

  setupPocDetail();
  setupUcDetail();
  initOverview();
  

  // Auth mode toggle (login vs signup)
  let isSignupMode = false;
  const authTitle = document.getElementById("auth-title");
  const authSubmitBtn = document.getElementById("auth-submit-btn");
  const authToggleBtn = document.getElementById("auth-toggle-btn");
  const authToggleText = document.getElementById("auth-toggle-text");
  const confirmPasswordLabel = document.getElementById("confirm-password-label");
  const confirmPasswordInput = document.getElementById("login-password-confirm");
  const nameLabel = document.getElementById("name-label");
  const nameInput = document.getElementById("login-name");

  if (authToggleBtn) {
    authToggleBtn.addEventListener("click", () => {
      isSignupMode = !isSignupMode;
      loginError.textContent = "";
      
      if (isSignupMode) {
        authTitle.textContent = "Sign Up";
        authSubmitBtn.textContent = "Create Account";
        authToggleText.textContent = "Already have an account?";
        authToggleBtn.textContent = "Sign in";
        confirmPasswordLabel.classList.remove("hidden");
        nameLabel.classList.remove("hidden");
        confirmPasswordInput.required = true;
        nameInput.required = true;
      } else {
        authTitle.textContent = "Login";
        authSubmitBtn.textContent = "Sign in";
        authToggleText.textContent = "Don't have an account?";
        authToggleBtn.textContent = "Sign up";
        confirmPasswordLabel.classList.add("hidden");
        nameLabel.classList.add("hidden");
        confirmPasswordInput.required = false;
        nameInput.required = false;
      }
    });
  }

  // Setup logout button
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }
  
  // Setup settings button
  const settingsBtn = document.getElementById("settings-btn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => showSettingsModal());
  }

  // Setup create POC button
  const createPocBtn = document.getElementById("create-poc-btn");
  if (createPocBtn) {
    createPocBtn.addEventListener("click", () => showCreatePocModal());
  }

  // Global refresh function — non-blocking (no loading overlay)
  let isRefreshing = false;
  window.refreshPocList = async function(showSpinner = true) {
    if (isRefreshing) {
      console.log("[POC-PORTAL] Refresh already in progress, skipping");
      return;
    }
    isRefreshing = true;
    console.log("[POC-PORTAL] Refreshing data...", showSpinner ? "(manual)" : "(auto)");

    const refreshBtn = document.getElementById("refresh-btn");
    if (showSpinner && refreshBtn) refreshBtn.classList.add("spinning");

    try {
      const { users, pocs, puc, roleText } = await fetchAllData(pb, appState.currentUser);
      appState.allUsers = users;
      appState.allPocs = pocs;
      appState.allPuc = puc;

      // Also refresh comments and feature requests
      const [allComments, allFeatureRequests] = await Promise.all([
        fetchAllComments(pb),
        fetchAllFeatureRequests(pb, pocs)
      ]);
      appState.allComments = allComments;
      appState.allFeatureRequests = allFeatureRequests;

      // Re-index comments by POC and use case
      appState.commentsByPoc.clear();
      appState.commentsByPuc.clear();
      allComments.forEach(c => {
        if (c.poc) {
          if (!appState.commentsByPoc.has(c.poc)) appState.commentsByPoc.set(c.poc, []);
          appState.commentsByPoc.get(c.poc).push(c);
        }
        if (c.poc_use_case) {
          const pucIds = Array.isArray(c.poc_use_case) ? c.poc_use_case : [c.poc_use_case];
          pucIds.forEach(pucId => {
            if (!appState.commentsByPuc.has(pucId)) appState.commentsByPuc.set(pucId, []);
            appState.commentsByPuc.get(pucId).push(c);
          });
        }
      });

      // Re-index feature requests by POC
      appState.featureRequestsByPoc.clear();
      allFeatureRequests.forEach(fr => {
        if (fr.poc) {
          if (!appState.featureRequestsByPoc.has(fr.poc)) appState.featureRequestsByPoc.set(fr.poc, []);
          appState.featureRequestsByPoc.get(fr.poc).push(fr);
        }
      });

      // Re-render the view
      const visibleSEs = buildVisibleSEs();
      await renderSeFilters(visibleSEs);
      await renderMainView();
      refreshPocDetailIfVisible();
      refreshUcDetailIfVisible();
      console.log("[POC-PORTAL] Refresh complete");
    } catch (err) {
      console.error("[POC-PORTAL] Failed to refresh:", err);
    } finally {
      isRefreshing = false;
      if (refreshBtn) refreshBtn.classList.remove("spinning");
    }
  };

  // Setup refresh button
  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => window.refreshPocList(true));
  }

  // Check for existing session
  if (pb.authStore.isValid) {
    console.log("[POC-PORTAL] Found valid session, auto-logging in...");
    try {
      showLoading("Restoring session...", "Checking authentication");
      
      // Refresh the auth to make sure it's still valid
      await pb.collection("users").authRefresh();
      const user = pb.authStore.model;
      
      console.log("[POC-PORTAL] Session restored for:", user.email);
      await initializePortal(pb, user);
    } catch (err) {
      console.log("[POC-PORTAL] Session expired, showing login");
      pb.authStore.clear();
      hideLoading(true);
    }
  }

  if (!loginForm) return;

  loginForm.addEventListener("submit", async (evt) => {
  evt.preventDefault();
  loginError.textContent = "";

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    if (isSignupMode) {
      const confirmPassword = confirmPasswordInput.value;
      const name = nameInput.value.trim();
      
      // Email domain validation
      const allowedDomains = ['venafi.com', 'cyberark.com', 'paloalto.com', 'paloaltonetworks.com'];
      const emailDomain = email.split('@')[1]?.toLowerCase();

      if (!allowedDomains.includes(emailDomain)) {
        loginError.textContent = "Signup is restricted to employees.";
        return;
      }
      
      if (password !== confirmPassword) {
        loginError.textContent = "Passwords do not match.";
        return;
      }
      
      if (password.length < 8) {
        loginError.textContent = "Password must be at least 8 characters.";
        return;
      }

      showLoading("Creating account...", "Please wait");
      
      console.log("[POC-PORTAL] Creating account for", email);
      
      // Create the user - default role is "se"
      await pb.collection("users").create({
        email: email,
        password: password,
        passwordConfirm: confirmPassword,
        name: name,
        role: "se"
      });
      
      // Auto-login after signup
      const user = await loginUser(pb, email, password);
      await initializePortal(pb, user);
      
    } else {
      showLoading("Signing in...", "Authenticating");
      console.log("[POC-PORTAL] Logging in as", email);
      const user = await loginUser(pb, email, password);
      await initializePortal(pb, user);
    }

  } catch (err) {
    console.error("[POC-PORTAL] Auth failed:", err);
    
    if (err.data?.data?.email?.message) {
      loginError.textContent = err.data.data.email.message;
    } else if (err.data?.data?.password?.message) {
      loginError.textContent = err.data.data.password.message;
    } else if (isSignupMode) {
      loginError.textContent = "Signup failed – " + (err.message || "please try again.");
    } else {
      loginError.textContent = "Login failed – please check credentials or server URL.";
    }
    hideLoading(true);
  }
});

});