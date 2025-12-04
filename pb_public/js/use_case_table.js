// use_case_table.js - Extracted use case table rendering
import { formatDate } from "./helpers.js";
import { appState } from "./state.js";
import { showProductBoardLinkModal } from "./productboard.js";

/**
 * Render rating stars
 */
function renderRatingStars(rating) {
  if (typeof rating !== "number" || rating <= 0) return "";
  const max = 5;
  const full = Math.round(Math.min(rating, max));
  const empty = max - full;
  return (
    '<span class="uc-stars">' +
    "★".repeat(full) +
    (empty > 0 ? "☆".repeat(empty) : "") +
    "</span>"
  );
}

/**
 * Render use case table for active POCs
 * @param {Array} pocUcs - POC use cases
 * @param {string} pocId - POC ID
 * @returns {string} HTML string
 */
export function renderActiveUseCaseTable(pocUcs, pocId) {
  const rows = (pocUcs || [])
    .filter((puc) => {
      const uc = puc.expand && puc.expand.use_case;
      if (!uc) return false;
      return puc.is_active || puc.is_completed;
    })
    .map((puc) => {
      const uc = puc.expand.use_case;
      const isPrep = !!uc.is_customer_prep;
      return { puc, uc, isPrep };
    });

  if (!rows.length) {
    return `<div class="poc-uc-empty hint">No use cases in scope for this POC.</div>`;
  }

  const prepRows = rows.filter((r) => r.isPrep);
  const otherRows = rows.filter((r) => !r.isPrep);

  const sortByTitle = (a, b) => {
    const ta = (a.uc.title || a.uc.code || "").toLowerCase();
    const tb = (b.uc.title || b.uc.code || "").toLowerCase();
    return ta.localeCompare(tb);
  };

  prepRows.sort(sortByTitle);
  otherRows.sort(sortByTitle);

  const renderRow = ({ puc, uc, isPrep, isFirstNonPrep }) => {
    const completed = !!puc.is_completed;
    const statusLabel = completed ? "✓" : "○";
    const statusClass = completed ? "uc-status-completed" : "uc-status-open";

    const ratingCell = renderRatingStars(puc.rating);
    const feedback =
      puc.last_comment_text ||
      puc.feedback ||
      (puc.expand &&
        puc.expand.latest_comment &&
        puc.expand.latest_comment.text) ||
      "";

    const pbLinks = puc.productboard_links || [];
    const pbBadge = pbLinks.length > 0
      ? `<span class="uc-pb-badge" title="${pbLinks.length} ProductBoard link(s)">📋 ${pbLinks.length}</span>`
      : "";

    const firstNonPrepClass = isFirstNonPrep ? "poc-uc-first-nonprep-row" : "";
    const rowClass = completed ? "poc-uc-row-completed" : "";

    return `
      <tr class="poc-uc-row ${rowClass} ${firstNonPrepClass}">
        <td class="poc-uc-cell uc-status">
          <span class="${statusClass}">${statusLabel}</span>
        </td>
        <td class="poc-uc-cell uc-title">
          ${isPrep ? '<span class="poc-uc-prep-dot" title="Customer prep"></span>' : ""}
          <span class="uc-title-text">${uc.title || uc.code || "Use case"}</span>
          <span class="uc-version">v${uc.version || 1}</span>
          ${pbBadge}
        </td>
        <td class="poc-uc-cell uc-rating">${ratingCell || "–"}</td>
        <td class="poc-uc-cell uc-feedback">
          ${feedback ? `<span class="uc-feedback-text">${feedback}</span>` : "–"}
        </td>
        <td class="poc-uc-cell uc-actions">
          <button type="button" class="uc-link-btn" data-uc-id="${puc.id}" data-poc-id="${pocId}" title="Link to ProductBoard">
            🔗
          </button>
        </td>
      </tr>
    `;
  };

  const bodyParts = [];

  if (prepRows.length) {
    bodyParts.push(prepRows.map((r) => renderRow({ ...r })).join(""));
  }

  if (otherRows.length) {
    bodyParts.push(
      otherRows
        .map((r, idx) =>
          renderRow({ ...r, isFirstNonPrep: idx === 0 && prepRows.length > 0 })
        )
        .join("")
    );
  }

  const bodyHtml = bodyParts.join("");

  return `
    <div class="poc-uc-table-wrapper">
      <table class="poc-uc-table poc-uc-table-compact">
        <thead>
          <tr>
            <th style="width: 40px;"></th>
            <th>Use Case</th>
            <th style="width: 100px;">Rating</th>
            <th>Customer Feedback</th>
            <th style="width: 60px;"></th>
          </tr>
        </thead>
        <tbody>
          ${bodyHtml}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Render use case table for closed POCs
 * @param {Array} pocUcs - POC use cases
 * @returns {string} HTML string
 */
export function renderClosedUseCaseTable(pocUcs) {
  const rows = (pocUcs || [])
    .filter((puc) => {
      const uc = puc.expand && puc.expand.use_case;
      if (!uc) return false;
      return puc.is_active || puc.is_completed;
    })
    .map((puc) => {
      const uc = puc.expand.use_case;
      const isPrep = !!uc.is_customer_prep;
      return { puc, uc, isPrep };
    });

  if (!rows.length) {
    return `<div class="poc-uc-empty hint">No use cases in scope for this POC.</div>`;
  }

  const prepRows = rows.filter((r) => r.isPrep);
  const otherRows = rows.filter((r) => !r.isPrep);

  const sortByTitle = (a, b) => {
    const ta = (a.uc.title || a.uc.code || "").toLowerCase();
    const tb = (b.uc.title || b.uc.code || "").toLowerCase();
    return ta.localeCompare(tb);
  };

  prepRows.sort(sortByTitle);
  otherRows.sort(sortByTitle);

  const renderRow = ({ puc, uc, isPrep }) => {
    const completed = !!puc.is_completed;
    const statusLabel = completed ? "✓" : "○";
    const statusClass = completed ? "uc-status-completed" : "uc-status-open";

    const ratingCell =
      typeof puc.rating === "number" && puc.rating > 0
        ? `<span class="uc-stars">${"★".repeat(
            Math.round(Math.min(puc.rating, 5))
          )}</span>`
        : "–";

    const feedback =
      puc.last_comment_text ||
      puc.feedback ||
      (puc.expand && puc.expand.latest_comment && puc.expand.latest_comment.text) ||
      "";

    const estHours =
      typeof uc.estimate_hours === "number"
        ? uc.estimate_hours
        : typeof puc.estimate_hours === "number"
        ? puc.estimate_hours
        : null;
    const estLabel = estHours != null ? `${estHours}h` : "–";

    const pbLinks = puc.productboard_links || [];
    const pbBadge = pbLinks.length > 0
      ? `<span class="uc-pb-badge" title="${pbLinks.length} ProductBoard link(s)">📋 ${pbLinks.length}</span>`
      : "";

    return `
      <tr class="poc-uc-row ${completed ? "poc-uc-row-completed" : ""}">
        <td class="poc-uc-cell uc-status">
          <span class="${statusClass}">${statusLabel}</span>
        </td>
        <td class="poc-uc-cell uc-title">
          ${isPrep ? '<span class="poc-uc-prep-dot" title="Customer prep"></span>' : ""}
          <span class="uc-title-text">${uc.title || uc.code || "Use case"}</span>
          <span class="uc-version">v${uc.version || 1}</span>
          ${pbBadge}
        </td>
        <td class="poc-uc-cell uc-estimate">${estLabel}</td>
        <td class="poc-uc-cell uc-rating">${ratingCell}</td>
        <td class="poc-uc-cell uc-feedback">
          ${feedback ? `<span class="uc-feedback-text">${feedback}</span>` : "–"}
        </td>
      </tr>
    `;
  };

  const bodyHtml = []
    .concat(prepRows.map(renderRow))
    .concat(otherRows.map(renderRow))
    .join("");

  return `
    <div class="poc-uc-table-wrapper">
      <table class="poc-uc-table poc-uc-table-compact">
        <thead>
          <tr>
            <th style="width: 40px;"></th>
            <th>Use Case</th>
            <th style="width: 60px;">Est.</th>
            <th style="width: 80px;">Rating</th>
            <th>Customer Feedback</th>
          </tr>
        </thead>
        <tbody>
          ${bodyHtml}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Attach event listeners to use case table buttons
 * @param {HTMLElement} container - The container element with the table
 */
export function attachUseCaseTableListeners(container) {
  // Handle ProductBoard link buttons
  container.addEventListener('click', async (e) => {
    const linkBtn = e.target.closest('.uc-link-btn');
    if (linkBtn) {
      e.stopPropagation();
      
      const ucId = linkBtn.dataset.ucId;
      const pocId = linkBtn.dataset.pocId;
      
      // TODO: Fetch current links from database
      const currentLinks = []; // await fetchProductBoardLinks(ucId);
      
      showProductBoardLinkModal(appState.pb, pocId, ucId);
    }
  });
}