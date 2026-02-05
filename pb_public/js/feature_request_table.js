// feature_request_table.js
// Feature Requests Display - Clean table layout matching Use Case table

import { appState } from "./state.js";
import {
  handleProductBoardError,
  showErrorNotification,
  showSuccessNotification,
} from "./productboard/error_handler.js";
import { formatDate } from "./helpers.js";

/**
 * Render feature requests toggle badge
 */
export function renderFeatureRequestSummary(count) {
  if (!count) return "";
  return `
    <button type="button" class="poc-fr-badge" data-action="toggle-feature-requests">
      <i data-lucide="clipboard-list" style="width:14px;height:14px;"></i> Feature Requests: ${count}
    </button>
  `;
}

/**
 * Render feature requests table section
 */
export function renderFeatureRequestsTable(featureRequests, pocId) {
  if (!featureRequests || !featureRequests.length) {
    return `<div class="poc-fr-section" style="display: none;">
      <div class="poc-fr-empty">No feature requests linked yet.</div>
    </div>`;
  }

  // Sort: deal breakers first, then by title
  const sorted = [...featureRequests].sort((a, b) => {
    if (a.is_deal_breaker && !b.is_deal_breaker) return -1;
    if (!a.is_deal_breaker && b.is_deal_breaker) return 1;
    const titleA = a.expand?.feature_request?.title || '';
    const titleB = b.expand?.feature_request?.title || '';
    return titleA.localeCompare(titleB);
  });

  const rows = sorted.map(fr => renderRow(fr)).join("");

  return `
    <div class="poc-fr-section" style="display: none;">
      <div class="poc-fr-table-wrap">
        <table class="poc-fr-tbl">
          <thead>
            <tr>
              <th class="poc-fr-th-title">Feature & SE Comment</th>
              <th class="poc-fr-th-status">Status</th>
              <th class="poc-fr-th-importance">Importance</th>
              <th class="poc-fr-th-needs">Needs By</th>
              <th class="poc-fr-th-pb">PB Timeframe</th>
              <th class="poc-fr-th-deal">Deal Breaker</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Render a single table row
 */
function renderRow(fr) {
  const feature = fr.expand?.feature_request || {};
  const useCase = fr.expand?.use_case;
  
  const title = feature.title || "(Untitled)";
  const url = feature.external_url || null;
  const status = feature.status || "unknown";
  const importance = fr.importance || "nice_to_have";
  const seComment = fr.se_comment || "";
  const isDealBreaker = fr.is_deal_breaker;
  
  const needsBy = fr.needed_by_date 
    ? formatDate(fr.needed_by_date) 
    : (fr.needed_by_timeframe || "—");
  
  const pbTimeframe = formatPBTimeframe(feature.timeframe);
  
  // Row class based on status/deal breaker
  let rowClass = "poc-fr-tr";
  if (isDealBreaker) rowClass += " poc-fr-tr--deal";
  if (status.toLowerCase() === "released") rowClass += " poc-fr-tr--released";

  return `
    <tr class="${rowClass}" data-fr-id="${fr.id}">
      <td class="poc-fr-td poc-fr-td-title">
        <div class="poc-fr-title-line">
          ${isDealBreaker ? '<span class="poc-fr-deal-badge"><i data-lucide="octagon-alert" style="width:14px;height:14px;"></i></span>' : ''}
          ${url 
            ? `<a href="${url}" target="_blank" class="poc-fr-title-link">${escapeHtml(title)}</a>`
            : `<span class="poc-fr-title-text">${escapeHtml(title)}</span>`
          }
          ${useCase ? `<span class="poc-fr-uc-badge">${escapeHtml(useCase.name || '')}</span>` : ''}
        </div>
        <textarea
          class="poc-fr-comment"
          data-action="update-comment"
          data-fr-id="${fr.id}"
          placeholder="Add SE comments..."
        >${escapeHtml(seComment)}</textarea>
      </td>
      <td class="poc-fr-td poc-fr-td-status">
        <span class="poc-fr-status-pill poc-fr-status-pill--${normalizeStatus(status)}">${formatStatus(status)}</span>
      </td>
      <td class="poc-fr-td poc-fr-td-importance">
        <select class="poc-fr-imp-select" data-action="update-importance" data-fr-id="${fr.id}">
          <option value="nice_to_have" ${importance === "nice_to_have" ? "selected" : ""}>Nice to Have</option>
          <option value="roadmap_candidate" ${importance === "roadmap_candidate" ? "selected" : ""}>Roadmap Candidate</option>
          <option value="time_sensitive" ${importance === "time_sensitive" ? "selected" : ""}>Time-Sensitive</option>
          <option value="critical" ${importance === "critical" ? "selected" : ""}>Critical</option>
        </select>
      </td>
      <td class="poc-fr-td poc-fr-td-needs">
        <button type="button" class="poc-fr-needs-btn" data-action="edit-timeframe" data-fr-id="${fr.id}" data-current-date="${fr.needed_by_date || ''}" data-current-timeframe="${fr.needed_by_timeframe || ''}">
          ${needsBy} <i data-lucide="pencil" class="poc-fr-edit-ico" style="width:12px;height:12px;"></i>
        </button>
      </td>
      <td class="poc-fr-td poc-fr-td-pb">${pbTimeframe}</td>
      <td class="poc-fr-td poc-fr-td-deal">
        <label class="poc-fr-deal-label">
          <input type="checkbox" data-action="toggle-dealbreaker" data-fr-id="${fr.id}" ${isDealBreaker ? "checked" : ""} />
        </label>
      </td>
    </tr>
  `;
}

function formatPBTimeframe(timeframe) {
  if (!timeframe) return "—";
  try {
    if (timeframe.granularity === "quarter") {
      const d = new Date(timeframe.startDate);
      return `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;
    } else if (timeframe.granularity === "month") {
      const s = new Date(timeframe.startDate);
      const e = new Date(timeframe.endDate);
      return `${s.toLocaleString("default", { month: "short" })}-${e.toLocaleString("default", { month: "short" })} ${s.getFullYear()}`;
    } else if (timeframe.granularity === "year") {
      return new Date(timeframe.startDate).getFullYear().toString();
    }
  } catch (e) {}
  return "—";
}

function normalizeStatus(status) {
  return (status || "unknown").toLowerCase().replace(/[\s_]+/g, "-");
}

function formatStatus(status) {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(text = "") {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Importance descriptions
const IMPORTANCE_INFO = {
  nice_to_have: {
    title: "Nice to Have",
    desc: "Non-essential improvement. No roadmap commitment required. Suitable for general feedback, UX improvements, or long-term ideas."
  },
  roadmap_candidate: {
    title: "Roadmap Candidate", 
    desc: "Valid requirement that we intend to address in the future, but no commitment on timing. Product may schedule it based on broader strategy and capacity."
  },
  time_sensitive: {
    title: "Time-Sensitive Requirement",
    desc: "Feature is commercially relevant and needs to be delivered within a defined timeframe, but does not block a deal. Requires coordination with Product for tentative or planned delivery timing."
  },
  critical: {
    title: "Critical Requirement",
    desc: "High-impact requirement that affects deal success, renewal, or customer retention. Customer expects a clear delivery commitment within a specific timeframe. PM alignment required."
  }
};

// Global tooltip element
let impTooltip = null;

function showImportanceTooltip(select) {
  const value = select.value;
  const info = IMPORTANCE_INFO[value];
  if (!info) return;
  
  // Create tooltip if not exists
  if (!impTooltip) {
    impTooltip = document.createElement('div');
    impTooltip.className = 'poc-fr-imp-tooltip';
    document.body.appendChild(impTooltip);
  }
  
  impTooltip.innerHTML = `
    <div class="poc-fr-imp-tooltip-title">${info.title}</div>
    <div class="poc-fr-imp-tooltip-desc">${info.desc}</div>
  `;
  
  // Position tooltip
  const rect = select.getBoundingClientRect();
  impTooltip.style.left = `${rect.left}px`;
  impTooltip.style.top = `${rect.bottom + 8}px`;
  
  // Make sure it doesn't go off screen
  requestAnimationFrame(() => {
    const tooltipRect = impTooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth - 20) {
      impTooltip.style.left = `${window.innerWidth - tooltipRect.width - 20}px`;
    }
    if (tooltipRect.bottom > window.innerHeight - 20) {
      impTooltip.style.top = `${rect.top - tooltipRect.height - 8}px`;
    }
  });
  
  impTooltip.classList.add('show');
}

function hideImportanceTooltip() {
  if (impTooltip) {
    impTooltip.classList.remove('show');
  }
}

/**
 * Attach event listeners
 */
export function attachFeatureRequestListeners(container) {
  // Toggle visibility
  container.querySelectorAll('[data-action="toggle-feature-requests"]').forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".poc-card");
      const section = card?.querySelector(".poc-fr-section");
      if (section) {
        const isHidden = section.style.display === "none";
        section.style.display = isHidden ? "block" : "none";
        btn.classList.toggle("active", isHidden);
      }
    });
  });

  // Edit timeframe
  container.querySelectorAll('[data-action="edit-timeframe"]').forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const frId = btn.dataset.frId;
      const currentDate = btn.dataset.currentDate || "";
      const currentTimeframe = btn.dataset.currentTimeframe || "";
      
      const result = prompt(
        "Enter date (YYYY-MM-DD) or timeframe (e.g., Q1 2025):",
        currentDate || currentTimeframe || ""
      );
      
      if (result === null) return;
      
      const isDate = /^\d{4}-\d{2}-\d{2}$/.test(result);
      await updateFeatureRequest(frId, {
        needed_by_date: isDate ? result : "",
        needed_by_timeframe: isDate ? "" : result
      });
      
      // Update button text
      btn.innerHTML = (result || "—") + ' <i data-lucide="pencil" class="poc-fr-edit-ico" style="width:12px;height:12px;"></i>';
    });
  });

  // Update importance
  container.querySelectorAll('[data-action="update-importance"]').forEach(select => {
    // Show tooltip on focus/change
    select.addEventListener("focus", () => showImportanceTooltip(select));
    select.addEventListener("change", async (e) => {
      e.stopPropagation();
      showImportanceTooltip(select);
      await updateFeatureRequest(select.dataset.frId, { importance: select.value });
      
      // Hide tooltip after a delay
      setTimeout(hideImportanceTooltip, 2500);
    });
    select.addEventListener("blur", () => {
      setTimeout(hideImportanceTooltip, 200);
    });
  });

  // Update comment (debounced)
  container.querySelectorAll('[data-action="update-comment"]').forEach(textarea => {
    let timeout;
    textarea.addEventListener("input", () => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        await updateFeatureRequest(textarea.dataset.frId, { se_comment: textarea.value });
      }, 1000);
    });
  });

  // Toggle deal breaker
  container.querySelectorAll('[data-action="toggle-dealbreaker"]').forEach(checkbox => {
    checkbox.addEventListener("change", async (e) => {
      e.stopPropagation();
      const frId = checkbox.dataset.frId;
      const isDealBreaker = checkbox.checked;

      if (isDealBreaker && !confirm("Mark as deal breaker? (This will trigger an escalation) ")) {
        checkbox.checked = false;
        return;
      }

      await updateFeatureRequest(frId, { is_deal_breaker: isDealBreaker });
      
      // Update row styling
      const row = checkbox.closest(".poc-fr-tr");
      if (row) {
        row.classList.toggle("poc-fr-tr--deal", isDealBreaker);
      }
    });
  });
}

async function updateFeatureRequest(frId, data) {
  try {
    await appState.pb.collection("poc_feature_requests").update(frId, data);
    if (data.is_deal_breaker !== undefined) {
      showSuccessNotification(data.is_deal_breaker ? "Marked as deal breaker" : "Removed deal breaker");
    } else if (data.importance) {
      showSuccessNotification("Updated");
    }
  } catch (error) {
    console.error("[FR] Update error:", error);
    showErrorNotification("Failed to update");
  }
}