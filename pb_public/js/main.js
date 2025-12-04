import { appState, loadSelectedSe } from "./state.js";
import { initPocketBase, loginUser, fetchAllData } from "./api.js";
import {
  initOverview,
  renderMainView,
  buildVisibleSEs,
  renderSeFilters,
} from "./overview.js";
import { setupPocDetail } from "./poc_detail.js";
import { setupUcDetail } from "./uc_detail.js";

const PB_BASE = "http://172.17.32.15:8090"; // adjust if needed

const loginSection = document.getElementById("login-section");
const portalSection = document.getElementById("portal-section");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userInfo = document.getElementById("user-info");
const roleHint = document.getElementById("role-hint");

document.addEventListener("DOMContentLoaded", () => {
  const pb = initPocketBase(PB_BASE);
  if (!pb) return;
  
  appState.pb = pb;
  
  setupPocDetail();
  setupUcDetail();
  initOverview();

  if (!loginForm) return;
  
  loginForm.addEventListener("submit", async (evt) => {
    evt.preventDefault();
    loginError.textContent = "";
    
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    
    try {
      console.log("[POC-PORTAL] Logging in as", email);
      const user = await loginUser(pb, email, password);
      appState.currentUser = user;
      
      userInfo.textContent = `Signed in as: ${user.email} (${user.role})`;
      loginSection.classList.add("hidden");
      portalSection.classList.remove("hidden");
      
      loadSelectedSe();
      
      const { users, pocs, puc, roleText } = await fetchAllData(pb, user);
      appState.allUsers = users;
      appState.allPocs = pocs;
      appState.allPuc = puc;
      
      if (roleHint) {
        roleHint.textContent = roleText;
      }
      
      // ✅ ProductBoard is configured via server proxy
      // No need to fetch token - server handles it securely
      console.log('[ProductBoard] Using secure server proxy');
      
      const visibleSEs = buildVisibleSEs();
      renderSeFilters(visibleSEs);
      await renderMainView();  // ✅ Added await here too
      
    } catch (err) {
      console.error("[POC-PORTAL] Login failed:", err);
      loginError.textContent = "Login failed – please check credentials or server URL.";
    }
  });
});