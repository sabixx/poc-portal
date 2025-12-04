// timeframe_selector.js - Timeframe picker for ProductBoard-style dates
// Supports: specific date, quarter (Q1 2025), half (H1 2025), year (2025), month (Jan 2025)

console.log('[Timeframe Selector] Module loaded');

let currentModal = null;
let onSelectCallback = null;

/**
 * Show the timeframe selector modal
 * @param {Object} params
 * @param {string} params.currentValue - Current timeframe value (e.g., "Q1 2025", "2025-03-15")
 * @param {Function} params.onSelect - Callback with selected value: { type, value, display }
 * @param {HTMLElement} params.anchorEl - Element to position near (optional)
 */
export function showTimeframeSelector({ currentValue = '', onSelect, anchorEl = null }) {
  console.log('[Timeframe Selector] showTimeframeSelector called with:', { currentValue, hasOnSelect: !!onSelect });
  closeTimeframeSelector();
  
  onSelectCallback = onSelect;
  
  const modal = document.createElement('div');
  modal.className = 'tf-selector-overlay';
  
  // Parse current value to set initial state
  const parsed = parseTimeframe(currentValue);
  const currentYear = new Date().getFullYear();
  
  modal.innerHTML = `
    <div class="tf-selector-popup">
      <div class="tf-selector-header">
        <span class="tf-selector-title">Select Timeframe</span>
        <button type="button" class="tf-selector-close">&times;</button>
      </div>
      
      <div class="tf-selector-body">
        <!-- Type Tabs -->
        <div class="tf-selector-tabs">
          <button type="button" class="tf-tab ${parsed.type === 'date' ? 'active' : ''}" data-type="date">Date</button>
          <button type="button" class="tf-tab ${parsed.type === 'quarter' ? 'active' : ''}" data-type="quarter">Quarter</button>
          <button type="button" class="tf-tab ${parsed.type === 'half' ? 'active' : ''}" data-type="half">Half</button>
          <button type="button" class="tf-tab ${parsed.type === 'month' ? 'active' : ''}" data-type="month">Month</button>
          <button type="button" class="tf-tab ${parsed.type === 'year' ? 'active' : ''}" data-type="year">Year</button>
        </div>
        
        <!-- Date Panel -->
        <div class="tf-panel" data-panel="date" ${parsed.type === 'date' ? '' : 'style="display:none"'}>
          <input type="date" class="tf-date-input" value="${parsed.type === 'date' ? parsed.value : ''}" />
        </div>
        
        <!-- Quarter Panel -->
        <div class="tf-panel" data-panel="quarter" ${parsed.type === 'quarter' ? '' : 'style="display:none"'}>
          <div class="tf-year-selector">
            <button type="button" class="tf-year-btn tf-year-prev">◀</button>
            <span class="tf-year-display">${parsed.year || currentYear}</span>
            <button type="button" class="tf-year-btn tf-year-next">▶</button>
          </div>
          <div class="tf-quarter-grid">
            <button type="button" class="tf-quarter-btn ${parsed.quarter === 1 ? 'selected' : ''}" data-q="1">Q1<span>Jan-Mar</span></button>
            <button type="button" class="tf-quarter-btn ${parsed.quarter === 2 ? 'selected' : ''}" data-q="2">Q2<span>Apr-Jun</span></button>
            <button type="button" class="tf-quarter-btn ${parsed.quarter === 3 ? 'selected' : ''}" data-q="3">Q3<span>Jul-Sep</span></button>
            <button type="button" class="tf-quarter-btn ${parsed.quarter === 4 ? 'selected' : ''}" data-q="4">Q4<span>Oct-Dec</span></button>
          </div>
        </div>
        
        <!-- Half Panel -->
        <div class="tf-panel" data-panel="half" ${parsed.type === 'half' ? '' : 'style="display:none"'}>
          <div class="tf-year-selector">
            <button type="button" class="tf-year-btn tf-year-prev">◀</button>
            <span class="tf-year-display">${parsed.year || currentYear}</span>
            <button type="button" class="tf-year-btn tf-year-next">▶</button>
          </div>
          <div class="tf-half-grid">
            <button type="button" class="tf-half-btn ${parsed.half === 1 ? 'selected' : ''}" data-h="1">H1<span>Jan-Jun</span></button>
            <button type="button" class="tf-half-btn ${parsed.half === 2 ? 'selected' : ''}" data-h="2">H2<span>Jul-Dec</span></button>
          </div>
        </div>
        
        <!-- Month Panel -->
        <div class="tf-panel" data-panel="month" ${parsed.type === 'month' ? '' : 'style="display:none"'}>
          <div class="tf-year-selector">
            <button type="button" class="tf-year-btn tf-year-prev">◀</button>
            <span class="tf-year-display">${parsed.year || currentYear}</span>
            <button type="button" class="tf-year-btn tf-year-next">▶</button>
          </div>
          <div class="tf-month-grid">
            ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => `
              <button type="button" class="tf-month-btn ${parsed.month === i+1 ? 'selected' : ''}" data-m="${i+1}">${m}</button>
            `).join('')}
          </div>
        </div>
        
        <!-- Year Panel -->
        <div class="tf-panel" data-panel="year" ${parsed.type === 'year' ? '' : 'style="display:none"'}>
          <div class="tf-year-grid">
            ${[currentYear-1, currentYear, currentYear+1, currentYear+2, currentYear+3].map(y => `
              <button type="button" class="tf-year-item ${parsed.year === y && parsed.type === 'year' ? 'selected' : ''}" data-y="${y}">${y}</button>
            `).join('')}
          </div>
        </div>
      </div>
      
      <div class="tf-selector-footer">
        <button type="button" class="tf-btn tf-btn-clear">Clear</button>
        <button type="button" class="tf-btn tf-btn-cancel">Cancel</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  currentModal = modal;
  
  console.log('[Timeframe Selector] Modal appended to body, checking CSS...');
  const computedStyle = window.getComputedStyle(modal);
  console.log('[Timeframe Selector] Modal display:', computedStyle.display, 'position:', computedStyle.position, 'z-index:', computedStyle.zIndex);
  
  // Track current year for each panel
  let displayYear = parsed.year || currentYear;
  
  // Event handlers
  const closeBtn = modal.querySelector('.tf-selector-close');
  const cancelBtn = modal.querySelector('.tf-btn-cancel');
  const clearBtn = modal.querySelector('.tf-btn-clear');
  
  closeBtn.addEventListener('click', closeTimeframeSelector);
  cancelBtn.addEventListener('click', closeTimeframeSelector);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeTimeframeSelector();
  });
  
  clearBtn.addEventListener('click', () => {
    if (onSelectCallback) {
      onSelectCallback({ type: 'none', value: '', display: '' });
    }
    closeTimeframeSelector();
  });
  
  // Tab switching
  modal.querySelectorAll('.tf-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.tf-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const type = tab.dataset.type;
      modal.querySelectorAll('.tf-panel').forEach(p => p.style.display = 'none');
      modal.querySelector(`[data-panel="${type}"]`).style.display = '';
    });
  });
  
  // Year navigation
  modal.querySelectorAll('.tf-year-prev').forEach(btn => {
    btn.addEventListener('click', () => {
      displayYear--;
      modal.querySelectorAll('.tf-year-display').forEach(el => el.textContent = displayYear);
    });
  });
  
  modal.querySelectorAll('.tf-year-next').forEach(btn => {
    btn.addEventListener('click', () => {
      displayYear++;
      modal.querySelectorAll('.tf-year-display').forEach(el => el.textContent = displayYear);
    });
  });
  
  // Date selection
  modal.querySelector('.tf-date-input').addEventListener('change', (e) => {
    const value = e.target.value;
    if (value && onSelectCallback) {
      const d = new Date(value);
      onSelectCallback({
        type: 'date',
        value: value,
        display: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      });
      closeTimeframeSelector();
    }
  });
  
  // Quarter selection
  modal.querySelectorAll('.tf-quarter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = parseInt(btn.dataset.q);
      if (onSelectCallback) {
        onSelectCallback({
          type: 'quarter',
          value: `Q${q} ${displayYear}`,
          display: `Q${q} ${displayYear}`,
          quarter: q,
          year: displayYear
        });
        closeTimeframeSelector();
      }
    });
  });
  
  // Half selection
  modal.querySelectorAll('.tf-half-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const h = parseInt(btn.dataset.h);
      if (onSelectCallback) {
        onSelectCallback({
          type: 'half',
          value: `H${h} ${displayYear}`,
          display: `H${h} ${displayYear}`,
          half: h,
          year: displayYear
        });
        closeTimeframeSelector();
      }
    });
  });
  
  // Month selection
  modal.querySelectorAll('.tf-month-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = parseInt(btn.dataset.m);
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      if (onSelectCallback) {
        onSelectCallback({
          type: 'month',
          value: `${monthNames[m-1]} ${displayYear}`,
          display: `${monthNames[m-1]} ${displayYear}`,
          month: m,
          year: displayYear
        });
        closeTimeframeSelector();
      }
    });
  });
  
  // Year selection
  modal.querySelectorAll('.tf-year-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const y = parseInt(btn.dataset.y);
      if (onSelectCallback) {
        onSelectCallback({
          type: 'year',
          value: `${y}`,
          display: `${y}`,
          year: y
        });
        closeTimeframeSelector();
      }
    });
  });
}

/**
 * Parse a timeframe string into components
 */
function parseTimeframe(value) {
  if (!value) return { type: 'quarter', year: new Date().getFullYear() };
  
  // Date: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { type: 'date', value };
  }
  
  // Quarter: Q1 2025 or Q1-2025
  const qMatch = value.match(/Q(\d)\s*[-]?\s*(\d{4})/i);
  if (qMatch) {
    return { type: 'quarter', quarter: parseInt(qMatch[1]), year: parseInt(qMatch[2]) };
  }
  
  // Half: H1 2025 or H1-2025
  const hMatch = value.match(/H(\d)\s*[-]?\s*(\d{4})/i);
  if (hMatch) {
    return { type: 'half', half: parseInt(hMatch[1]), year: parseInt(hMatch[2]) };
  }
  
  // Month: Jan 2025, January 2025
  const mMatch = value.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(\d{4})/i);
  if (mMatch) {
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const month = months.indexOf(mMatch[1].toLowerCase().slice(0,3)) + 1;
    return { type: 'month', month, year: parseInt(mMatch[2]) };
  }
  
  // Year only: 2025
  const yMatch = value.match(/^(\d{4})$/);
  if (yMatch) {
    return { type: 'year', year: parseInt(yMatch[1]) };
  }
  
  // Default
  return { type: 'quarter', year: new Date().getFullYear() };
}

/**
 * Parse ProductBoard timeframe object
 * @param {Object} pbTimeframe - ProductBoard timeframe { granularity, startDate, endDate }
 * @returns {string} Display string
 */
export function formatPBTimeframe(pbTimeframe) {
  if (!pbTimeframe || !pbTimeframe.startDate) return '';
  
  const start = new Date(pbTimeframe.startDate);
  const granularity = pbTimeframe.granularity || 'quarter';
  
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

function closeTimeframeSelector() {
  if (currentModal) {
    currentModal.remove();
    currentModal = null;
  }
  onSelectCallback = null;
}

export { closeTimeframeSelector, parseTimeframe };