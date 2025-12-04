import { appState } from "./state.js";
import {
  mapStateToLabel,
  userDisplayLabel,
  getPucForPoc,
} from "./helpers.js";

const usecaseDetailSection = document.getElementById(
  "usecase-detail-section"
);
const ucDetailBack = document.getElementById("usecase-detail-back");
const ucDetailTitle = document.getElementById("usecase-detail-title");
const ucDetailTableBody = document.querySelector(
  "#usecase-detail-table tbody"
);

export function setupUcDetail() {
  if (ucDetailBack) {
    ucDetailBack.addEventListener("click", () => {
      switchView("overview");
    });
  }
}

function switchView(view) {
  const portalSection = document.getElementById("portal-section");
  const pocDetailSection = document.getElementById("poc-detail-section");

  if (view === "overview") {
    portalSection && portalSection.classList.remove("hidden");
    pocDetailSection && pocDetailSection.classList.add("hidden");
    usecaseDetailSection && usecaseDetailSection.classList.add("hidden");
  } else if (view === "uc") {
    portalSection && portalSection.classList.add("hidden");
    pocDetailSection && pocDetailSection.classList.add("hidden");
    usecaseDetailSection && usecaseDetailSection.classList.remove("hidden");
  }
}

export function showUseCaseDetail(uc) {
  if (!usecaseDetailSection) return;

  ucDetailTitle.textContent = `${uc.code} v${uc.version || 1} – ${
    uc.title || ""
  }`;
  ucDetailTableBody.innerHTML = "";

  const relevantPuc = appState.allPuc.filter(
    (puc) =>
      puc.expand &&
      puc.expand.use_case &&
      puc.expand.use_case.id === uc.id
  );

  relevantPuc.forEach((puc) => {
    const poc = puc.expand && puc.expand.poc;
    if (!poc) return;

    const se = poc.expand?.se;
    const tr = document.createElement("tr");
    const rating = puc.rating != null ? puc.rating : "";

    tr.innerHTML = `
      <td>${poc.name}</td>
      <td>${se ? userDisplayLabel(se) : "Unknown SE"}</td>
      <td>${uc.version || 1}</td>
      <td>${mapStateToLabel(puc)}</td>
      <td>${rating}</td>
      <td>${puc.completed_at || ""}</td>
      <td><!-- comments from separate collection --></td>
    `;

    ucDetailTableBody.appendChild(tr);
  });

  switchView("uc");
}
