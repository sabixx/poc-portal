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

console.log("[POC-PORTAL] main.js VERSION 2.0 - Session persistence + Settings");

const PB_BASE = "http://172.17.32.15:8090"; // adjust if needed

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
  
  // Show logout and settings buttons
  document.getElementById("logout-btn")?.classList.remove("hidden");
  document.getElementById("settings-btn")?.classList.remove("hidden");

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
    fetchAllFeatureRequests(pb)
  ]);
  appState.allComments = allComments;
  appState.allFeatureRequests = allFeatureRequests;
  
  // Pre-index comments by POC and use case
  appState.commentsByPoc = new Map();
  appState.commentsByPuc = new Map();
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

  // Pre-index feature requests by POC
  appState.featureRequestsByPoc = new Map();
  allFeatureRequests.forEach(fr => {
    if (fr.poc) {
      if (!appState.featureRequestsByPoc.has(fr.poc)) {
        appState.featureRequestsByPoc.set(fr.poc, []);
      }
      appState.featureRequestsByPoc.get(fr.poc).push(fr);
    }
  });
  console.log("[POC-PORTAL] Indexed feature requests:", appState.featureRequestsByPoc.size, "POCs");

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
  document.getElementById("logout-btn")?.classList.add("hidden");
  document.getElementById("settings-btn")?.classList.add("hidden");
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
      showLoading("Signing in...", "Authenticating");
      
      console.log("[POC-PORTAL] Logging in as", email);
      const user = await loginUser(pb, email, password);
      
      await initializePortal(pb, user);

    } catch (err) {
      console.error("[POC-PORTAL] Login failed:", err);
      loginError.textContent = "Login failed – please check credentials or server URL.";
      hideLoading(true);
    }
  });
});