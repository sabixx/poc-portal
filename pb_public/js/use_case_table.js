// use_case_table.js - Use case table with inline Feature Requests
// VERSION 4.0 - Fixed: timeframe display, added ER toggle
import { formatDate } from "./helpers.js";
import { appState } from "./state.js";
import { showProductBoardLinkModal } from "./productboard.js";
import { showTimeframeSelector } from "./timeframe_selector.js";
import { showCreateInsightModal } from "./create_insight_modal.js";

console.log('[UC-Table] VERSION 4.0 - Timeframe fix + ER toggle');

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
 * Escape HTML to prevent XSS
 */
function escapeHtml(text = "") {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

/**
 * Format status for display
 */
function formatStatus(status) {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Normalize status for CSS class
 */
function normalizeStatus(status) {
  return (status || "unknown").toLowerCase().replace(/[\s_]+/g, "-");
}

/**
 * Format PB timeframe - handles both string and object formats
 * @param {string|Object} timeframe - Either "Q1 2025" string or { granularity, startDate, endDate } object
 * @returns {string} Display string
 */
function formatPBTimeframe(timeframe) {
  if (!timeframe) return '';
  
  // If it's already a string (like "Q1 2025", "Q4 2028"), just return it
  if (typeof timeframe === 'string') {
    return timeframe;
  }
  
  // If it's an object with startDate (ProductBoard API format)
  if (typeof timeframe === 'object' && timeframe.startDate) {
    const start = new Date(timeframe.startDate);
    if (isNaN(start.getTime())) return '';
    
    const granularity = timeframe.granularity || 'quarter';
    
    if (granularity === 'quarter') {
      const q = Math.ceil((start.getMonth() + 1) / 3);
      return `Q${q} ${start.getFullYear()}`;
    } else if (granularity === 'month') {
      return start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } else if (granularity === 'year') {
      return `${start.getFullYear()}`;
    } else if (granularity === 'half') {
      const h = start.getMonth() < 6 ? 1 : 2;
      return `H${h} ${start.getFullYear()}`;
    }
    
    return start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  
  return '';
}

/**
 * Get customer feedback from comments for a use case
 */
function getCustomerFeedback(puc) {
  if (puc.feedback && puc.feedback.trim()) return puc.feedback;
  if (puc.last_comment_text && puc.last_comment_text.trim()) return puc.last_comment_text;
  
  if (puc.expand?.comments && Array.isArray(puc.expand.comments)) {
    const feedbackComment = puc.expand.comments.find(c => 
      c.kind === 'feedback' && c.text && c.text.trim()
    );
    if (feedbackComment) return feedbackComment.text;
    
    const anyComment = puc.expand.comments.find(c => c.text && c.text.trim());
    if (anyComment) return anyComment.text;
  }
  
  if (puc.expand?.latest_comment?.text) return puc.expand.latest_comment.text;
  
  return "";
}

/**
 * Render use case table for active POCs - WITH INLINE ERs AND TOGGLE
 * @param {Array} pocUcs - POC use cases
 * @param {string} pocId - POC ID
 * @param {Array} featureRequests - Feature requests for this POC (optional)
 * @param {string} customerName - Customer name for insights (optional)
 * @param {boolean} showERs - Whether to show ERs inline (default: true)
 * @returns {string} HTML string
 */
export function renderActiveUseCaseTable(pocUcs, pocId, featureRequests = [], customerName = '', showERs = true) {
  // Group ERs by use_case ID
  const ersByUseCase = {};
  const pocLevelERs = [];
  
  if (showERs) {
    (featureRequests || []).forEach(fr => {
      if (fr.use_case) {
        if (!ersByUseCase[fr.use_case]) ersByUseCase[fr.use_case] = [];
        ersByUseCase[fr.use_case].push(fr);
      } else {
        pocLevelERs.push(fr);
      }
    });
  }

  const rows = (pocUcs || [])
    .filter((puc) => {
      const uc = puc.expand && puc.expand.use_case;
      if (!uc) return false;
      return puc.is_active || puc.is_completed;
    })
    .map((puc) => {
      const uc = puc.expand.use_case;
      const isPrep = !!uc.is_customer_prep;
      const ers = showERs ? (ersByUseCase[puc.use_case] || ersByUseCase[puc.id] || []) : [];
      const feedback = getCustomerFeedback(puc);
      return { puc, uc, isPrep, ers, feedback };
    });

  if (!rows.length && !pocLevelERs.length) {
    return `<div class="poc-uc-empty hint">No use cases or feature requests for this POC.</div>`;
  }

  const prepRows = rows.filter((r) => r.isPrep);
  const otherRows = rows.filter((r) => !r.isPrep);

  const sortByOrder = (a, b) => {
    const orderA = a.puc.order || 0;
    const orderB = b.puc.order || 0;
    if (orderA > 0 && orderB > 0 && orderA !== orderB) return orderA - orderB;
    if (orderA > 0 && orderB <= 0) return -1;
    if (orderB > 0 && orderA <= 0) return 1;
    const ta = (a.uc.title || a.uc.code || "").toLowerCase();
    const tb = (b.uc.title || b.uc.code || "").toLowerCase();
    return ta.localeCompare(tb);
  };

  prepRows.sort(sortByOrder);
  otherRows.sort(sortByOrder);

  const renderRow = ({ puc, uc, isPrep, isFirstNonPrep, ers, feedback }) => {
    const completed = !!puc.is_completed;
    const statusLabel = completed ? '<i data-lucide="circle-check" style="width:16px;height:16px;"></i>' : '<i data-lucide="circle" style="width:16px;height:16px;"></i>';
    const statusClass = completed ? "uc-status-completed" : "uc-status-open";

    const ratingCell = renderRatingStars(puc.rating);

    const erCount = ers.length;
    const erBadge = erCount > 0
      ? `<span class="uc-er-badge" title="${erCount} Feature Request(s)"><i data-lucide="clipboard-list" style="width:12px;height:12px;"></i> ${erCount}</span>`
      : "";

    const firstNonPrepClass = isFirstNonPrep ? "poc-uc-first-nonprep-row" : "";
    const rowClass = completed ? "poc-uc-row-completed" : "";

    const erSubRows = showERs ? ers.map(fr => renderERSubRow(fr, pocId, customerName, feedback)).join("") : "";

    return `
      <tr class="poc-uc-row ${rowClass} ${firstNonPrepClass}" data-puc-id="${puc.id}">
        <td class="poc-uc-cell uc-status">
          <span class="${statusClass}">${statusLabel}</span>
        </td>
        <td class="poc-uc-cell uc-title">
          ${isPrep ? '<span class="poc-uc-prep-dot" title="Customer prep"></span>' : ""}
          <span class="uc-title-text">${uc.title || uc.code || "Use case"}</span>
          <span class="uc-version">v${uc.version || 1}</span>
          ${erBadge}
        </td>
        <td class="poc-uc-cell uc-rating">${ratingCell || "–"}</td>
        <td class="poc-uc-cell uc-feedback">
          ${feedback ? `<span class="uc-feedback-text">${escapeHtml(feedback)}</span>` : "–"}
        </td>
        <td class="poc-uc-cell uc-actions">
          <button type="button" class="uc-link-btn" data-uc-id="${puc.use_case || puc.id}" data-poc-id="${pocId}" title="Link Feature Request">
            <i data-lucide="link" style="width:14px;height:14px;"></i>
          </button>
        </td>
      </tr>
      ${erSubRows}
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

  // ER Toggle checkbox - always at the very top
  const erCount = (featureRequests || []).length;
  const toggleHtml = erCount > 0 ? `
    <div class="poc-uc-er-toggle">
      <label>
        <input type="checkbox" data-action="toggle-ers" ${showERs ? 'checked' : ''} />
        Show Feature Requests (${erCount})
      </label>
    </div>
  ` : '';

  // POC-level ERs section (only when toggle is on)
  const pocLevelSection = (showERs && pocLevelERs.length > 0) ? `
    <div class="poc-uc-poc-ers-section">
      <div class="poc-uc-poc-ers-title">
        <span><i data-lucide="clipboard-list" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> POC-Level Feature Requests</span>
        <span class="poc-uc-poc-ers-count">${pocLevelERs.length}</span>
      </div>
      <div class="poc-uc-poc-ers-list">
        ${pocLevelERs.map(fr => renderERCard(fr, pocId, customerName)).join("")}
      </div>
    </div>
  ` : "";

  return `
    <div class="poc-uc-table-wrapper" data-poc-id="${pocId}" data-customer-name="${escapeHtml(customerName)}" data-show-ers="${showERs}">
      ${toggleHtml}
      ${pocLevelSection}
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
 * Render a Feature Request as a card (for POC-level ERs above the table)
 */
function renderERCard(fr, pocId, customerName = '') {
  const feature = fr.expand?.feature_request || {};
  const title = feature.title || feature.name || "(Untitled)";
  const url = feature.external_url || feature.url || null;
  const status = feature.status || "unknown";
  const importance = fr.importance || "nice_to_have";
  const seComment = fr.se_comment || "";
  const isDealBreaker = fr.is_deal_breaker;
  
  const needsBy = fr.needed_by || "";
  const needsByDisplay = needsBy || "—";
  const pbTimeframe = formatPBTimeframe(feature.timeframe) || "—";
  
  const cardClass = isDealBreaker ? "poc-uc-er-card poc-uc-er-card--deal" : "poc-uc-er-card";

  return `
    <div class="${cardClass}" 
         data-fr-id="${fr.id}" 
         data-feature-id="${feature.id || ''}" 
         data-feature-title="${escapeHtml(title)}" 
         data-customer-name="${escapeHtml(customerName)}" 
         data-customer-feedback="">
      <div class="poc-uc-er-header">
        ${isDealBreaker ? '<span class="poc-uc-er-deal-badge" title="Deal Breaker"><i data-lucide="octagon-alert" style="width:14px;height:14px;"></i></span>' : ""}
        ${url
          ? `<a href="${url}" target="_blank" class="poc-uc-er-title-link">${escapeHtml(title)}</a>`
          : `<span class="poc-uc-er-title-text">${escapeHtml(title)}</span>`
        }
        <span class="poc-uc-er-status poc-uc-er-status--${normalizeStatus(status)}">${formatStatus(status)}</span>

        <button type="button" class="poc-uc-er-insight-btn" data-action="create-insight" title="Create ProductBoard Insight">
          <i data-lucide="lightbulb" style="width:14px;height:14px;"></i> Insight
        </button>
      </div>
      
      <div class="poc-uc-er-body">
        <textarea 
          class="poc-uc-er-comment" 
          data-action="update-comment" 
          placeholder="Add SE comments..."
        >${escapeHtml(seComment)}</textarea>
        
        <div class="poc-uc-er-fields">
          <div class="poc-uc-er-field">
            <label>Importance</label>
            <select data-action="update-importance">
              <option value="nice_to_have" ${importance === "nice_to_have" ? "selected" : ""}>Nice to Have</option>
              <option value="roadmap_candidate" ${importance === "roadmap_candidate" ? "selected" : ""}>Roadmap Candidate</option>
              <option value="time_sensitive" ${importance === "time_sensitive" ? "selected" : ""}>Time-Sensitive</option>
              <option value="critical" ${importance === "critical" ? "selected" : ""}>Critical</option>
            </select>
          </div>
          
          <div class="poc-uc-er-field">
            <label>Needs By</label>
            <button type="button" class="poc-uc-er-needs-btn" data-action="edit-timeframe" data-current="${escapeHtml(needsBy)}">
              ${needsByDisplay} <i data-lucide="pencil" style="width:12px;height:12px;"></i>
            </button>
          </div>
          
          <div class="poc-uc-er-field">
            <label>PB Timeframe</label>
            <span class="poc-uc-er-pb-tf">${pbTimeframe}</span>
          </div>
          
          <div class="poc-uc-er-field poc-uc-er-field--deal">
            <label>
              <input type="checkbox" data-action="toggle-dealbreaker" ${isDealBreaker ? "checked" : ""} />
              Deal breaker
            </label>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render a Feature Request as a sub-row under a Use Case
 */
function renderERSubRow(fr, pocId, customerName = '', customerFeedback = '', isPocLevel = false) {
  const feature = fr.expand?.feature_request || {};
  const title = feature.title || feature.name || "(Untitled)";
  const url = feature.external_url || feature.url || null;
  const status = feature.status || "unknown";
  const importance = fr.importance || "nice_to_have";
  const seComment = fr.se_comment || "";
  const isDealBreaker = fr.is_deal_breaker;
  
  // Use the needed_by field (text) from poc_feature_requests
  const needsBy = fr.needed_by || "";
  const needsByDisplay = needsBy || "—";
  
  // Format PB timeframe from feature_requests table (can be string or object)
  const pbTimeframe = formatPBTimeframe(feature.timeframe) || "—";

  const rowClass = [
    "poc-uc-er-row",
    isDealBreaker ? "poc-uc-er-row--deal" : "",
    isPocLevel ? "poc-uc-er-row--poc-level" : ""
  ].filter(Boolean).join(" ");

  return `
    <tr class="${rowClass}" 
        data-fr-id="${fr.id}" 
        data-feature-id="${feature.id || ''}" 
        data-feature-title="${escapeHtml(title)}" 
        data-customer-name="${escapeHtml(customerName)}" 
        data-customer-feedback="${escapeHtml(customerFeedback)}">
      <td colspan="5" class="poc-uc-er-content">

        <div class="poc-uc-er-header">
          ${isDealBreaker ? '<span class="poc-uc-er-deal-badge" title="Deal Breaker"><i data-lucide="octagon-alert" style="width:14px;height:14px;"></i></span>' : ""}
          ${url 
            ? `<a href="${url}" target="_blank" class="poc-uc-er-title-link">${escapeHtml(title)}</a>`
            : `<span class="poc-uc-er-title-text">${escapeHtml(title)}</span>`
          }
          <span class="poc-uc-er-status poc-uc-er-status--${normalizeStatus(status)}">${formatStatus(status)}</span>
          
          <!-- Create Insight Button -->
          <button type="button" class="poc-uc-er-insight-btn" data-action="create-insight" title="Create ProductBoard Insight">
            <i data-lucide="lightbulb" style="width:14px;height:14px;"></i> Insight
          </button>
        </div>
        
        <div class="poc-uc-er-body">
          <textarea 
            class="poc-uc-er-comment" 
            data-action="update-comment" 
            placeholder="Add SE comments..."
          >${escapeHtml(seComment)}</textarea>
          
          <div class="poc-uc-er-fields">
            <div class="poc-uc-er-field">
              <label>Importance</label>
              <select data-action="update-importance">
                <option value="nice_to_have" ${importance === "nice_to_have" ? "selected" : ""}>Nice to Have</option>
                <option value="roadmap_candidate" ${importance === "roadmap_candidate" ? "selected" : ""}>Roadmap Candidate</option>
                <option value="time_sensitive" ${importance === "time_sensitive" ? "selected" : ""}>Time-Sensitive</option>
                <option value="critical" ${importance === "critical" ? "selected" : ""}>Critical</option>
              </select>
            </div>
            
            <div class="poc-uc-er-field">
              <label>Needs By</label>
              <button type="button" class="poc-uc-er-needs-btn" data-action="edit-timeframe" data-current="${escapeHtml(needsBy)}">
                ${needsByDisplay} <i data-lucide="pencil" style="width:12px;height:12px;"></i>
              </button>
            </div>
            
            <div class="poc-uc-er-field">
              <label>PB Timeframe</label>
              <span class="poc-uc-er-pb-tf">${pbTimeframe}</span>
            </div>
            
            <div class="poc-uc-er-field poc-uc-er-field--deal">
              <label>
                <input type="checkbox" data-action="toggle-dealbreaker" ${isDealBreaker ? "checked" : ""} />
                Deal breaker
              </label>
            </div>
          </div>
        </div>

      </td>
    </tr>
  `;
}

/**
 * Render use case table for closed POCs
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

  const sortByOrder = (a, b) => {
    const orderA = a.puc.order || 0;
    const orderB = b.puc.order || 0;
    if (orderA > 0 && orderB > 0 && orderA !== orderB) return orderA - orderB;
    if (orderA > 0 && orderB <= 0) return -1;
    if (orderB > 0 && orderA <= 0) return 1;
    const ta = (a.uc.title || a.uc.code || "").toLowerCase();
    const tb = (b.uc.title || b.uc.code || "").toLowerCase();
    return ta.localeCompare(tb);
  };

  prepRows.sort(sortByOrder);
  otherRows.sort(sortByOrder);

  const renderRow = ({ puc, uc, isPrep }) => {
    const completed = !!puc.is_completed;
    const statusLabel = completed ? '<i data-lucide="circle-check" style="width:16px;height:16px;"></i>' : '<i data-lucide="circle" style="width:16px;height:16px;"></i>';
    const statusClass = completed ? "uc-status-completed" : "uc-status-open";

    const ratingCell =
      typeof puc.rating === "number" && puc.rating > 0
        ? `<span class="uc-stars">${"★".repeat(Math.round(Math.min(puc.rating, 5)))}</span>`
        : "–";

    const feedback = getCustomerFeedback(puc);

    const estHours =
      typeof uc.estimate_hours === "number"
        ? uc.estimate_hours
        : typeof puc.estimate_hours === "number"
        ? puc.estimate_hours
        : null;
    const estLabel = estHours != null ? `${estHours}h` : "–";

    return `
      <tr class="poc-uc-row ${completed ? "poc-uc-row-completed" : ""}">
        <td class="poc-uc-cell uc-status">
          <span class="${statusClass}">${statusLabel}</span>
        </td>
        <td class="poc-uc-cell uc-title">
          ${isPrep ? '<span class="poc-uc-prep-dot" title="Customer prep"></span>' : ""}
          <span class="uc-title-text">${uc.title || uc.code || "Use case"}</span>
          <span class="uc-version">v${uc.version || 1}</span>
        </td>
        <td class="poc-uc-cell uc-estimate">${estLabel}</td>
        <td class="poc-uc-cell uc-rating">${ratingCell}</td>
        <td class="poc-uc-cell uc-feedback">
          ${feedback ? `<span class="uc-feedback-text">${escapeHtml(feedback)}</span>` : "–"}
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
 * Attach event listeners to use case table using EVENT DELEGATION
 * @param {HTMLElement} container - The container element (POC card)
 * @param {Function} onRefresh - Callback to refresh the card after changes (optional)
 */
export function attachUseCaseTableListeners(container, onRefresh = null) {
  let commentTimeout = null;
  
  // USE EVENT DELEGATION
  container.addEventListener('click', async (e) => {
    const target = e.target;
    
    // ---- ER Toggle checkbox ----
    if (target.matches('[data-action="toggle-ers"]')) {
      const wrapper = container.querySelector('.poc-uc-table-wrapper');
      if (!wrapper) return;
      
      const showERs = target.checked;

      // Store preference and trigger re-render
      wrapper.dataset.showErs = showERs;
      
      // Dispatch event to re-render
      container.dispatchEvent(new CustomEvent('toggle-ers', { 
        bubbles: true, 
        detail: { showERs } 
      }));
      return;
    }
    
    // ---- ProductBoard link button (on UC row) ----
    const linkBtn = target.closest('.uc-link-btn');
    if (linkBtn) {
      e.stopPropagation();
      const ucId = linkBtn.dataset.ucId;
      const pocId = linkBtn.dataset.pocId;

      showProductBoardLinkModal(appState.pb, pocId, ucId, () => {
        if (onRefresh) {
          onRefresh();
        } else {
          container.dispatchEvent(new CustomEvent('er-linked', { bubbles: true, detail: { pocId, ucId } }));
        }
      });
      return;
    }
    
    // ---- Create Insight button ----
    if (target.closest('[data-action="create-insight"]')) {
      e.stopPropagation();
      // Support both table rows and card divs
      const row = target.closest('.poc-uc-er-row') || target.closest('.poc-uc-er-card');
      if (!row) return;
      
      const frId = row.dataset.frId;
      const featureId = row.dataset.featureId;
      const featureTitle = row.dataset.featureTitle;
      const customerName = row.dataset.customerName;
      const customerFeedback = row.dataset.customerFeedback;
      const seComment = row.querySelector('.poc-uc-er-comment')?.value || '';
      
      const wrapper = container.querySelector('.poc-uc-table-wrapper');
      const pocId = wrapper?.dataset.pocId || '';

      showCreateInsightModal({
        customerName,
        featureTitle,
        featureId,
        seComment,
        customerFeedback,
        pocId,
        frLinkId: frId
      });
      return;
    }
    
    // ---- Timeframe edit button ----
    if (target.closest('[data-action="edit-timeframe"]')) {
      e.stopPropagation();
      const btn = target.closest('[data-action="edit-timeframe"]');
      // Support both table rows and card divs
      const row = btn.closest('.poc-uc-er-row') || btn.closest('.poc-uc-er-card');
      if (!row) return;
      
      const frId = row.dataset.frId;
      const currentValue = btn.dataset.current || '';

      showTimeframeSelector({
        currentValue: currentValue === '—' ? '' : currentValue,
        onSelect: async (result) => {
          try {
            await appState.pb.collection('poc_feature_requests').update(frId, {
              needed_by: result.value || ''
            });
            
            btn.dataset.current = result.value || '';
            btn.innerHTML = (result.display || '—') + ' <i data-lucide="pencil" style="width:12px;height:12px;"></i>';
            if (window.lucide) lucide.createIcons();
          } catch (error) {
            console.error('[UC-Table] Failed to update timeframe:', error);
          }
        }
      });
      return;
    }
  });
  
  // ---- Importance dropdown and Deal breaker checkbox (use change event) ----
  container.addEventListener('change', async (e) => {
    const target = e.target;
    
    // ER Toggle (also handled here for checkbox)
    if (target.matches('[data-action="toggle-ers"]')) {
      // Already handled in click, but catch change too
      return;
    }
    
    // Importance select
    if (target.matches('[data-action="update-importance"]')) {
      e.stopPropagation();
      // Support both table rows and card divs
      const row = target.closest('.poc-uc-er-row') || target.closest('.poc-uc-er-card');
      if (!row) return;
      
      const frId = row.dataset.frId;

      try {
        await appState.pb.collection('poc_feature_requests').update(frId, { 
          importance: target.value 
        });
      } catch (error) {
        console.error('[UC-Table] Failed to update importance:', error);
      }
      return;
    }
    
    // Deal breaker checkbox
    if (target.matches('[data-action="toggle-dealbreaker"]')) {
      e.stopPropagation();
      // Support both table rows and card divs
      const row = target.closest('.poc-uc-er-row') || target.closest('.poc-uc-er-card');
      if (!row) return;
      
      const frId = row.dataset.frId;
      const isDealBreaker = target.checked;

      if (isDealBreaker && !confirm('Mark as deal breaker?')) {
        target.checked = false;
        return;
      }
      
      try {
        await appState.pb.collection('poc_feature_requests').update(frId, { 
          is_deal_breaker: isDealBreaker 
        });
        
        // Toggle class for both row and card types
        row.classList.toggle('poc-uc-er-row--deal', isDealBreaker);
        row.classList.toggle('poc-uc-er-card--deal', isDealBreaker);
      } catch (error) {
        console.error('[UC-Table] Failed to update deal breaker:', error);
      }
      return;
    }
  });
  
  // ---- Comment textarea (use input event with debounce) ----
  container.addEventListener('input', (e) => {
    const target = e.target;
    
    if (target.matches('[data-action="update-comment"]')) {
      // Support both table rows and card divs
      const row = target.closest('.poc-uc-er-row') || target.closest('.poc-uc-er-card');
      if (!row) return;
      
      const frId = row.dataset.frId;

      clearTimeout(commentTimeout);
      commentTimeout = setTimeout(async () => {
        try {
          await appState.pb.collection('poc_feature_requests').update(frId, { 
            se_comment: target.value 
          });
        } catch (error) {
          console.error('[UC-Table] Failed to update comment:', error);
        }
      }, 1000);
    }
  });
}

