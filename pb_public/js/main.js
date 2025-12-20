// main.js - Entry point for POC Portal
// VERSION 2.0 - Session persistence + Logout + Settings
import { appState, loadSelectedSe } from "./state.js";
import { initPocketBase, loginUser, fetchAllData, fetchAllComments, fetchAllFeatureRequests } from "./api.js";
import {
  initOverview,
  renderMainView,
  buildVisibleSEs,
  renderSeFilters,
} from "./overview.js";
import { setupPocDetail } from "./poc_detail.js";
import { setupUcDetail } from "./uc_detail.js";
import { renderUseCaseStats } from "./overview_stats.js";
import { initLoadingOverlay, showLoading, hideLoading } from "./loading.js";
import { showSettingsModal } from "./settings.js";
import { initExecDashboard, refreshExecDashboard } from "./exec_dashboard.js";

console.log("[POC-PORTAL] main.js VERSION 0.0.5 - Session persistence + Settings + Exec Dashboard");

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
 * Load all data and initialize the portal after authentication
 */
async function initializePortal(pb, user) {
  appState.currentUser = user;
  
  // Update UI
  userInfo.innerHTML = `Signed in as: ${user.email} (${user.role})`;
  loginSection.classList.add("hidden");
  portalSection.classList.remove("hidden");
  
  // Show logout, settings, and exec dashboard buttons
  document.getElementById("logout-btn")?.classList.remove("hidden");
  document.getElementById("settings-btn")?.classList.remove("hidden");
  document.getElementById("exec-dashboard-btn")?.classList.remove("hidden");

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
  console.log("[POC-PORTAL] Indexed comments:", appState.commentsByPoc.size, "POCs,", appState.commentsByPuc.size, "use cases");

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
  console.log("[POC-PORTAL] Indexed feature requests:", appState.featureRequestsByPoc.size, "POCs,", allFeatureRequests.length, "total ERs");
  // Debug: Show which POCs have feature requests
  if (appState.featureRequestsByPoc.size > 0) {
    console.log("[POC-PORTAL] POCs with feature requests:", Array.from(appState.featureRequestsByPoc.keys()));
  } else if (allFeatureRequests.length > 0) {
    // ERs were fetched but not indexed - likely missing poc field
    console.warn("[POC-PORTAL] WARNING: Fetched", allFeatureRequests.length, "ERs but none indexed. Sample ER:", allFeatureRequests[0]);
  }

  if (roleHint) {
    roleHint.textContent = roleText;
  }

  console.log('[ProductBoard] Using secure server proxy');

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
}

/**
 * Setup executive dashboard navigation handlers
 */
function setupExecDashboardNav() {
  const portalSection = document.getElementById("portal-section");
  const execSection = document.getElementById("exec-dashboard-section");
  const execBtn = document.getElementById("exec-dashboard-btn");
  const execBackBtn = document.getElementById("exec-back-btn");

  // Open executive dashboard
  if (execBtn) {
    execBtn.addEventListener("click", () => {
      console.log("[POC-PORTAL] Opening Executive Dashboard");
      portalSection?.classList.add("hidden");
      execSection?.classList.remove("hidden");

      // Initialize/refresh the exec dashboard
      initExecDashboard();
    });
  }

  // Back to portal
  if (execBackBtn) {
    execBackBtn.addEventListener("click", () => {
      console.log("[POC-PORTAL] Returning to Portal");
      execSection?.classList.add("hidden");
      portalSection?.classList.remove("hidden");
    });
  }
}

/**
 * Handle logout
 */
function handleLogout() {
  console.log("[POC-PORTAL] Logging out...");
  appState.pb.authStore.clear();
  appState.currentUser = null;
  
  // Clear session storage so next login starts fresh
  sessionStorage.removeItem("pocPortal_sessionStarted");
  
  // Reset UI
  loginSection.classList.remove("hidden");
  portalSection.classList.add("hidden");
  document.getElementById("exec-dashboard-section")?.classList.add("hidden");
  document.getElementById("logout-btn")?.classList.add("hidden");
  document.getElementById("settings-btn")?.classList.add("hidden");
  document.getElementById("exec-dashboard-btn")?.classList.add("hidden");
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