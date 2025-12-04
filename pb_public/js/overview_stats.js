// overview_stats.js
import { appState } from "./state.js";

const summaryActive = document.getElementById("summary-active-pocs");
const summaryAtRisk = document.getElementById("summary-at-risk");
const summaryCompleted30 = document.getElementById("summary-completed-30d");
const summaryOpenUCs = document.getElementById("summary-open-ucs");
const summaryCompletedUCs = document.getElementById("summary-completed-ucs");

const statsTop = document.getElementById("stats-top-rated");
const statsLow = document.getElementById("stats-low-rated");
const statsMost = document.getElementById("stats-most-completed");
const statsNever = document.getElementById("stats-never-completed");

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Renders the summary metrics and the use-case stats section
 * based on the current POC filter.
 */
export function renderStats(filteredPocs, asOfDate) {
  const now = asOfDate || new Date();

  let activeCount = 0;
  let atRiskCount = 0;
  let completedLast30 = 0;

  const activePocIds = new Set();

  filteredPocs.forEach((p) => {
    const lastStr = p.last_daily_update_at;
    const last = lastStr ? new Date(lastStr) : null;
    let diffDays = Infinity;

    if (last && !Number.isNaN(last.getTime())) {
      diffDays = (now - last) / DAY_MS;
    }

    if (diffDays < 0) diffDays = 0;

    const isActive = diffDays <= 2;

    if (isActive) {
      activeCount++;
      activePocIds.add(p.id);

      const risk = p.risk_status || "on_track";
      if (risk === "at_risk" || risk === "overdue") {
        atRiskCount++;
      }
    } else if (diffDays > 2 && diffDays <= 30) {
      completedLast30++;
    }
  });

  // use-case stats only for active POCs
  const pucFiltered = appState.allPuc.filter((puc) =>
    activePocIds.has(puc.poc)
  );

  let openUCs = 0;
  let completedUCs = 0;

  const byUc = {};

  pucFiltered.forEach((puc) => {
    const uc = puc.expand && puc.expand.use_case;
    if (!uc) return;

    if (puc.is_active && !puc.is_completed) openUCs++;
    if (puc.is_completed) completedUCs++;

    const key = `${uc.code}::${uc.version || 1}`;
    if (!byUc[key]) {
      byUc[key] = {
        code: uc.code,
        title: uc.title,
        version: uc.version || 1,
        ratings: [],
        completed: 0,
        total: 0,
      };
    }
    const bucket = byUc[key];
    bucket.total++;
    if (puc.is_completed) bucket.completed++;

    const hasValidRating =
      typeof puc.rating === "number" && puc.rating > 0;
    if (hasValidRating) {
      bucket.ratings.push(puc.rating);
    }
  });

  if (summaryActive) summaryActive.textContent = activeCount;
  if (summaryAtRisk) summaryAtRisk.textContent = atRiskCount;
  if (summaryCompleted30) summaryCompleted30.textContent = completedLast30;
  if (summaryOpenUCs) summaryOpenUCs.textContent = openUCs;
  if (summaryCompletedUCs) summaryCompletedUCs.textContent = completedUCs;

  const stats = Object.values(byUc).map((uc) => {
    const avg =
      uc.ratings.length > 0
        ? uc.ratings.reduce((a, b) => a + b, 0) / uc.ratings.length
        : null;
    return {
      code: uc.code,
      title: uc.title,
      version: uc.version,
      avg_rating: avg,
      ratings_count: uc.ratings.length,
      completed_count: uc.completed,
      total_count: uc.total,
    };
  });

  const rated = stats.filter((s) => s.avg_rating !== null);
  const topRated = [...rated]
    .sort((a, b) => b.avg_rating - a.avg_rating)
    .slice(0, 5);
  const lowRated = [...rated]
    .sort((a, b) => a.avg_rating - b.avg_rating)
    .slice(0, 5);
  const mostCompleted = [...stats]
    .sort((a, b) => b.completed_count - a.completed_count)
    .slice(0, 5);
  const neverCompleted = stats
    .filter((s) => s.completed_count === 0 && s.total_count > 0)
    .slice(0, 10);

  function renderList(el, list, formatter) {
    if (!el) return;
    el.innerHTML = "";
    if (!list.length) {
      el.innerHTML = `<li class="hint">No data.</li>`;
      return;
    }
    list.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = formatter(item);
      el.appendChild(li);
    });
  }

  renderList(
    statsTop,
    topRated,
    (s) =>
      `${s.code} v${s.version}: ${s.title} (Ø ${s.avg_rating.toFixed(
        2
      )} / 5, n=${s.ratings_count})`
  );
  renderList(
    statsLow,
    lowRated,
    (s) =>
      `${s.code} v${s.version}: ${s.title} (Ø ${s.avg_rating.toFixed(
        2
      )} / 5, n=${s.ratings_count})`
  );
  renderList(
    statsMost,
    mostCompleted,
    (s) =>
      `${s.code} v${s.version}: ${s.title} (${s.completed_count}/${s.total_count} completed)`
  );
  renderList(
    statsNever,
    neverCompleted,
    (s) => `${s.code} v${s.version}: ${s.title}`
  );
}
