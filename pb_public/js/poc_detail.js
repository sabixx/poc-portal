// poc_detail.js
import { appState } from "./state.js";
import {
  formatDate,
  mapStateToLabel,
  getPucForPoc,
} from "./helpers.js";

const pocDetailSection = document.getElementById("poc-detail-section");
const pocDetailBack = document.getElementById("poc-detail-back");
const pocDetailTitle = document.getElementById("poc-detail-title");
const pocDetailMeta = document.getElementById("poc-detail-meta");
const pocDetailTableBody = document.querySelector("#poc-detail-table tbody");

// Optional filter controls (add them to the HTML – see below)
const pucStateFilter = document.getElementById("puc-state-filter"); // all | open | completed
// const pocOutcomeFilter = document.getElementById("poc-outcome-filter"); // all | won | lost (TO BE WIRED)

let currentPoc = null;

export function setupPocDetail() {
  if (pocDetailBack) {
    pocDetailBack.addEventListener("click", () => {
      switchView("overview");
    });
  }

  // Re-render table when filter changes
  if (pucStateFilter) {
    pucStateFilter.addEventListener("change", () => {
      if (currentPoc) {
        renderPucTable(currentPoc);
      }
    });
  }

  // If you add won/lost filter later, hook it here:
  // if (pocOutcomeFilter) {
  //   pocOutcomeFilter.addEventListener("change", () => {
  //     if (currentPoc) {
  //       renderPucTable(currentPoc);
  //     }
  //   });
  // }
}

function switchView(view) {
  const portalSection = document.getElementById("portal-section");
  const usecaseDetailSection = document.getElementById(
    "usecase-detail-section"
  );

  if (view === "overview") {
    portalSection && portalSection.classList.remove("hidden");
    pocDetailSection && pocDetailSection.classList.add("hidden");
    usecaseDetailSection && usecaseDetailSection.classList.add("hidden");
  } else if (view === "poc") {
    portalSection && portalSection.classList.add("hidden");
    pocDetailSection && pocDetailSection.classList.remove("hidden");
    usecaseDetailSection && usecaseDetailSection.classList.add("hidden");
  }
}

export function showPocDetail(poc) {
  if (!pocDetailSection) return;

  currentPoc = poc;

  const seLabel =
    "SE: " +
    (poc.expand?.se?.email ||
      poc.expand?.se?.username ||
      "Unknown SE");

  pocDetailTitle.textContent = poc.name;

  pocDetailMeta.textContent = `Customer: ${
    poc.customer_name || "–"
  } · Partner: ${poc.partner || "–"} · ${seLabel} · Prep: ${formatDate(
    poc.prep_start_date
  )} · POC: ${formatDate(poc.poc_start_date)} → ${formatDate(
    poc.poc_end_date_plan
  )}`;

  renderPucTable(poc);
  switchView("poc");
}

function renderPucTable(poc) {
  if (!pocDetailTableBody) return;

  pocDetailTableBody.innerHTML = "";

  const allPucForPoc = getPucForPoc(poc.id, appState.allPuc).sort((a, b) => {
    const ucA = a.expand && a.expand.use_case;
    const ucB = b.expand && b.expand.use_case;
    return (ucA?.code || "").localeCompare(ucB?.code || "");
  });

  const stateFilter = pucStateFilter ? pucStateFilter.value : "all";

  const filteredPuc = allPucForPoc.filter((puc) => {
    if (stateFilter === "open" && puc.state !== "open") return false;
    if (stateFilter === "completed" && puc.state !== "completed") return false;
    return true;
  });

  filteredPuc.forEach((puc) => {
    const uc = puc.expand && puc.expand.use_case;
    if (!uc) return;

    const tr = document.createElement("tr");
    const rating = puc.rating != null ? puc.rating : "";
    const version = uc.version || 1;
    const completedAt = puc.completed_at
      ? formatDate(puc.completed_at)
      : "";

    tr.innerHTML = `
      <td class="cell text-left">${uc.title || ""}</td>
      <td class="cell text-left">v${version}</td>
      <td class="cell text-left">${mapStateToLabel(puc)}</td>
      <td class="cell text-left">${rating}</td>
      <td class="cell text-left">${completedAt}</td>
      <td class="cell text-left"></td>
    `;

    pocDetailTableBody.appendChild(tr);
  });
}
