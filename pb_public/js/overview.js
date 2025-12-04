// overview.js
import { appState, saveSelectedSe } from "./state.js";
import { userDisplayLabel, getPucForPoc } from "./helpers.js";
import { renderActivePocCard } from "./poc_card_active.js";
import { renderClosedPocCard } from "./poc_card_closed.js";
import { renderStats } from "./overview_stats.js";


// DOM refs
const seFiltersContainer = document.getElementById("se-filters");
const activePocsContainer = document.getElementById("active-pocs");
const closedPocsContainer = document.getElementById("closed-pocs");
const asOfInput = document.getElementById("as-of-date");
const btnSeAll = document.getElementById("se-select-all");
const btnSeNone = document.getElementById("se-select-none");
const btnAsOfApply = document.getElementById("as-of-apply");
const toggleOldPocs = document.getElementById("toggle-old-pocs");

// ===== init ==========================================================

export function initOverview() {
  if (btnSeAll) {
    btnSeAll.addEventListener("click", () => {
      const visibleSEs = buildVisibleSEs();
      appState.selectedSeIds = new Set(visibleSEs.map((u) => u.id));
      saveSelectedSe();
      renderSeFilters(visibleSEs);
      renderMainView();
    });
  }

  if (btnSeNone) {
    btnSeNone.addEventListener("click", () => {
      appState.selectedSeIds = new Set();
      saveSelectedSe();
      renderSeFilters(buildVisibleSEs());
      renderMainView();
    });
  }

  if (btnAsOfApply) {
    btnAsOfApply.addEventListener("click", () => {
      renderMainView();
    });
  }

  if (toggleOldPocs) {
    toggleOldPocs.addEventListener("change", () => {
      appState.showOldPocs = toggleOldPocs.checked;
      renderMainView();
    });
  }
}

// ===== SE Filters ====================================================

export function buildVisibleSEs() {
  const seIdSet = new Set(appState.allPocs.map((p) => p.se).filter(Boolean));
  return appState.allUsers.filter(
    (u) => u.role === "se" && seIdSet.has(u.id)
  );
}

export function renderSeFilters(visibleSEs) {
  seFiltersContainer.innerHTML = "";
  if (!visibleSEs.length) {
    seFiltersContainer.textContent = "No SEs for current filters.";
    return;
  }

  visibleSEs.forEach((se) => {
    const label = document.createElement("label");
    label.className = "filter-se-item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = se.id;
    cb.checked =
      appState.selectedSeIds.size === 0 ||
      appState.selectedSeIds.has(se.id);

    cb.addEventListener("change", () => {
      if (cb.checked) appState.selectedSeIds.add(se.id);
      else appState.selectedSeIds.delete(se.id);
      saveSelectedSe();
      renderMainView();
    });

    label.appendChild(cb);
    label.appendChild(document.createTextNode(userDisplayLabel(se)));
    seFiltersContainer.appendChild(label);
  });

  // If nothing selected -> select all visible
  if (appState.selectedSeIds.size === 0) {
    visibleSEs.forEach((u) => appState.selectedSeIds.add(u.id));
    saveSelectedSe();
    Array.from(
      seFiltersContainer.querySelectorAll("input[type=checkbox]")
    ).forEach((cb) => {
      cb.checked = true;
    });
  }
}

// ===== main overview render =========================================

export async function renderMainView() {
  const portalSection = document.getElementById("portal-section");
  if (!portalSection) return;

  const filtered = appState.allPocs.filter((p) =>
    appState.selectedSeIds.size === 0
      ? true
      : appState.selectedSeIds.has(p.se)
  );

  const asOfStr = asOfInput ? asOfInput.value : "";
  const asOfDate = asOfStr ? new Date(asOfStr) : new Date();

  // 🔹 make as-of date available to cards
  appState.asOfDate = asOfDate;

  await renderStats(filtered, asOfDate);
  await renderPocCards(filtered, asOfDate);
}

// ===== POC grouping & card rendering ================================

async function renderPocCards(filteredPocs, asOfDate) {
  console.log("[POC-PORTAL] renderPocCards called", {
    filteredCount: filteredPocs?.length,
    asOfDate,
    showOldPocs: appState.showOldPocs,
  });

  if (!Array.isArray(filteredPocs)) {
    console.error("[POC-PORTAL] filteredPocs is not an array:", filteredPocs);
    return;
  }

  activePocsContainer.innerHTML = "";
  closedPocsContainer.innerHTML = "";

  const active = [];
  const closed = [];

  filteredPocs.forEach((p) => {
    // --- last update age in days ---
    const lastStr = p.last_daily_update_at;
    const last = lastStr ? new Date(lastStr) : null;
    let diffDays = Infinity;

    if (last && !Number.isNaN(last.getTime())) {
      diffDays = (asOfDate - last) / (1000 * 60 * 60 * 24);
    }
    if (diffDays < 0) diffDays = 0;

    // --- use-case completion status ---
    const pocUcs = getPucForPoc(p.id, appState.allPuc) || [];

    let totalUc = 0;
    let completedUc = 0;

    pocUcs.forEach((puc) => {
      const uc = puc.expand && puc.expand.use_case;
      if (!uc) return;
      if (!puc.is_active && !puc.is_completed) return;

      totalUc++;
      if (puc.is_completed) completedUc++;
    });

    const allUseCasesCompleted = totalUc > 0 && completedUc === totalUc;

    // --- final active/closed decision ---
    const isActive = !allUseCasesCompleted && diffDays <= 2;

    if (isActive) {
      active.push(p);
    } else {
      closed.push(p);
    }
  });

  console.log("[POC-PORTAL] split POCs", {
    active: active.length,
    closed: closed.length,
  });

  const visibleClosed = closed.filter((p) => {
    if (p.is_completed && !appState.showOldPocs) return false;
    return true;
  });

  console.log("[POC-PORTAL] visibleClosed", visibleClosed.length);

  const activeGroups = groupBySe(active);
  const closedGroups = groupBySe(visibleClosed);

  console.log("[POC-PORTAL] groups", {
    activeGroups: activeGroups.length,
    closedGroups: closedGroups.length,
  });

  await renderPocGroupList(activeGroups, activePocsContainer, renderActivePocCard);
  await renderPocGroupList(closedGroups, closedPocsContainer, renderClosedPocCard);
}

// ✅ FIXED: This function now properly handles async card rendering
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

    // ✅ Changed to for...of and added await
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