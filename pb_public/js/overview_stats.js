// overview_stats.js - Use-case statistics
import { appState } from "./state.js";
import { categorizePoc } from "./poc_status.js";
import { getPucForPoc } from "./helpers.js";

const statsTop = document.getElementById("stats-top-rated");
const statsLow = document.getElementById("stats-low-rated");
const statsMost = document.getElementById("stats-most-completed");
const statsNever = document.getElementById("stats-never-completed");

/**
 * Renders the use-case stats section based on active POCs
 */
export function renderUseCaseStats(filteredPocs, asOfDate) {
  const now = asOfDate || new Date();

  // Get active POC IDs
  const activePocIds = new Set();

  filteredPocs.forEach((p) => {
    const pocUcs = getPucForPoc(p.id, appState.allPuc) || [];
    const categorized = categorizePoc(p, pocUcs, now);
    
    if (categorized.isActive) {
      activePocIds.add(p.id);
    }
  });

  // Filter use cases to only active POCs
  const pucFiltered = appState.allPuc.filter((puc) =>
    activePocIds.has(puc.poc)
  );

  // Build use case stats
  const byUc = {};

  pucFiltered.forEach((puc) => {
    const uc = puc.expand && puc.expand.use_case;
    if (!uc) return;

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
