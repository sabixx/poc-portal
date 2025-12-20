// exec_drilldown.js - Executive Dashboard Drill-Down Table
// VERSION 1.0 - Customer-level detail view

import { getPocStatusLabel } from "./exec_filters.js";

console.log("[ExecDrilldown] VERSION 1.0 - Drill-down table initialized");

/**
 * Parse AEB value to number
 */
function parseAEB(aebValue) {
  if (!aebValue) return 0;
  const cleaned = String(aebValue).replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Format AEB for display
 */
function formatAEB(aebValue) {
  const num = parseAEB(aebValue);
  if (num === 0) return '-';
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Get AEB color class based on commercial result
 * Green for won customers, orange for at-risk (missing features)
 */
function getAEBColorClass(commercialResult) {
  if (commercialResult === 'now_customer') {
    return 'aeb-won';
  }
  return 'aeb-at-risk';
}

/**
 * Escape HTML
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format importance for display
 */
function formatImportance(importance) {
  const labels = {
    'critical': 'Critical',
    'time_sensitive': 'Time-Sensitive',
    'roadmap_candidate': 'Roadmap Candidate',
    'nice_to_have': 'Nice to Have',
  };
  return labels[importance] || importance || '-';
}

/**
 * Get importance CSS class
 */
function getImportanceClass(importance) {
  if (importance === 'critical') return 'critical';
  if (importance === 'time_sensitive') return 'time_sensitive';
  return '';
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format commercial result (outcome) for display
 */
function formatOutcome(commercialResult) {
  const labels = {
    'now_customer': 'Won',
    'lost': 'Lost',
    'no_decision': 'No Decision',
    'other': 'Other',
    'unknown': 'Open',
  };
  return labels[commercialResult] || 'Open';
}

/**
 * Get outcome CSS class
 */
function getOutcomeClass(commercialResult) {
  if (commercialResult === 'now_customer') return 'outcome-won';
  if (commercialResult === 'lost') return 'outcome-lost';
  return 'outcome-open';
}

/**
 * Render drill-down panel for a specific ER
 * @param {HTMLElement} container - Container element
 * @param {Object} erData - ER aggregation data { er, totalAEB, customers: [...] }
 * @param {Function} onClose - Callback when panel is closed
 */
export function renderERDrilldown(container, erData, onClose) {
  const { er, customers } = erData;

  // Sort customers by AEB descending
  const sortedCustomers = [...customers].sort((a, b) => parseAEB(b.aeb) - parseAEB(a.aeb));

  container.innerHTML = `
    <div class="exec-drilldown-header">
      <div class="exec-drilldown-title">
        <span style="color: var(--text-secondary);">ER:</span> ${escapeHtml(er.title)}
        <span style="margin-left: 1rem; font-size: 0.85rem; color: var(--text-secondary);">
          (${customers.length} customer${customers.length !== 1 ? 's' : ''})
        </span>
      </div>
      <button type="button" class="exec-drilldown-close">Close</button>
    </div>
    <table class="exec-drilldown-table">
      <thead>
        <tr>
          <th>Customer</th>
          <th>AEB</th>
          <th>Needs By</th>
          <th>Outcome</th>
          <th>Deal Blocker</th>
          <th>Region</th>
          <th>Importance</th>
        </tr>
      </thead>
      <tbody>
        ${sortedCustomers.map(c => `
          <tr>
            <td class="exec-drilldown-customer">${escapeHtml(c.customerName)}</td>
            <td class="exec-drilldown-aeb ${getAEBColorClass(c.commercialResult)}">${formatAEB(c.aeb)}</td>
            <td class="exec-drilldown-date">${formatDate(c.needsByDate)}</td>
            <td>
              <span class="exec-drilldown-outcome ${getOutcomeClass(c.commercialResult)}">${formatOutcome(c.commercialResult)}</span>
            </td>
            <td>
              <span class="exec-drilldown-deal-breaker ${c.isDealBreaker ? 'yes' : 'no'}">
                ${c.isDealBreaker ? 'Yes' : 'No'}
              </span>
            </td>
            <td>${escapeHtml(c.region)}</td>
            <td class="exec-drilldown-importance ${getImportanceClass(c.importance)}">
              ${formatImportance(c.importance)}
            </td>
          </tr>
        `).join('')}
        ${sortedCustomers.length === 0 ? `
          <tr>
            <td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
              No customers found for this ER
            </td>
          </tr>
        ` : ''}
      </tbody>
    </table>
  `;

  container.classList.remove('hidden');

  // Close button handler
  const closeBtn = container.querySelector('.exec-drilldown-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      container.classList.add('hidden');
      if (onClose) onClose();
    });
  }
}

/**
 * Render drill-down panel for summary metric click
 * Shows all customers in the filtered scope
 * @param {HTMLElement} container - Container element
 * @param {string} title - Panel title
 * @param {Array} pocsWithDetails - Array of { poc, region, ers: [...] }
 * @param {Function} onClose - Callback when panel is closed
 */
export function renderSummaryDrilldown(container, title, pocsWithDetails, onClose) {
  // Sort by AEB descending
  const sorted = [...pocsWithDetails].sort((a, b) => parseAEB(b.poc.aeb) - parseAEB(a.poc.aeb));

  container.innerHTML = `
    <div class="exec-drilldown-header">
      <div class="exec-drilldown-title">
        ${escapeHtml(title)}
        <span style="margin-left: 1rem; font-size: 0.85rem; color: var(--text-secondary);">
          (${sorted.length} POC${sorted.length !== 1 ? 's' : ''})
        </span>
      </div>
      <button type="button" class="exec-drilldown-close">Close</button>
    </div>
    <table class="exec-drilldown-table">
      <thead>
        <tr>
          <th>Customer</th>
          <th>AEB</th>
          <th>Needs By</th>
          <th>Outcome</th>
          <th>Region</th>
          <th>ERs (Deal Blockers)</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(item => {
          const p = item.poc;
          const dealBlockerCount = item.ers.filter(e => e.isDealBreaker).length;
          const erCount = item.ers.length;
          const aebColorClass = getAEBColorClass(item.commercialResult);
          const needsByDate = p.poc_end_date_plan || p.poc_end_date || null;
          return `
            <tr>
              <td class="exec-drilldown-customer">${escapeHtml(p.customer_name)}</td>
              <td class="exec-drilldown-aeb ${aebColorClass}">${formatAEB(p.aeb)}</td>
              <td class="exec-drilldown-date">${formatDate(needsByDate)}</td>
              <td>
                <span class="exec-drilldown-outcome ${getOutcomeClass(item.commercialResult)}">${formatOutcome(item.commercialResult)}</span>
              </td>
              <td>${escapeHtml(item.region)}</td>
              <td>
                ${erCount > 0 ? `${erCount} ER${erCount > 1 ? 's' : ''}` : '-'}
                ${dealBlockerCount > 0 ? `<span class="exec-drilldown-deal-breaker yes" style="margin-left: 0.5rem;">(${dealBlockerCount} blocker${dealBlockerCount > 1 ? 's' : ''})</span>` : ''}
              </td>
            </tr>
          `;
        }).join('')}
        ${sorted.length === 0 ? `
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
              No POCs match the current filters
            </td>
          </tr>
        ` : ''}
      </tbody>
    </table>
  `;

  container.classList.remove('hidden');

  // Close button handler
  const closeBtn = container.querySelector('.exec-drilldown-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      container.classList.add('hidden');
      if (onClose) onClose();
    });
  }
}

/**
 * Hide drill-down panel
 */
export function hideDrilldown(container) {
  container.classList.add('hidden');
  container.innerHTML = '';
}
