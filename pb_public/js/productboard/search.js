// productboard/search.js
// Search functionality

import { searchFeatures } from './api.js';
import { SEARCH_DEBOUNCE_MS, MIN_SEARCH_LENGTH } from './config.js';

let searchTimeout = null;

/**
 * Setup search functionality
 * @param {HTMLElement} container - Modal container
 * @param {Function} onResultClick - Callback when result is clicked
 */
export function setupSearch(container, onResultClick) {
  const searchInput = container.querySelector('.pb-search-input');
  const productSelect = container.querySelector('.pb-product-select');
  const resultsContainer = container.querySelector('.pb-search-results');
  
  if (!searchInput || !resultsContainer) {
    console.error('[ProductBoard Search] Required elements not found');
    return;
  }
  
  // Search input handler
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    const product = productSelect ? productSelect.value : '';
    handleSearch(query, product, resultsContainer, onResultClick);
  });
  
  // Product filter handler
  if (productSelect) {
    productSelect.addEventListener('change', (e) => {
      const query = searchInput.value.trim();
      const product = e.target.value;
      if (query.length >= MIN_SEARCH_LENGTH) {
        handleSearch(query, product, resultsContainer, onResultClick);
      }
    });
  }
}

/**
 * Handle search with debouncing
 */
function handleSearch(query, product, resultsContainer, onResultClick) {
  // Clear previous timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  
  // Show hint if query too short
  if (query.length < MIN_SEARCH_LENGTH) {
    resultsContainer.innerHTML = '<div class="pb-search-hint">Type at least 2 characters to search...</div>';
    return;
  }
  
  // Show loading state
  resultsContainer.innerHTML = '<div class="pb-loading">Searching...</div>';
  
  // Debounce search
  searchTimeout = setTimeout(async () => {
    try {
      const results = await searchFeatures(query, product);
      renderSearchResults(results, resultsContainer, onResultClick);
    } catch (error) {
      console.error('[ProductBoard Search] Search failed:', error);
      resultsContainer.innerHTML = `
        <div class="pb-error">
          <strong>Search failed</strong>
          <p>${error.message}</p>
        </div>
      `;
    }
  }, SEARCH_DEBOUNCE_MS);
}

/**
 * Render search results
 */
function renderSearchResults(results, container, onResultClick) {
  if (!results || results.length === 0) {
    container.innerHTML = '<div class="pb-no-results">No features found. Try a different search term.</div>';
    return;
  }
  
  const html = results.map(feature => `
    <div class="pb-result-item" data-feature-id="${feature.id}">
      <div class="pb-result-info">
        <div class="pb-result-title">${escapeHtml(feature.title)}</div>
        <div class="pb-result-meta">
          <span class="pb-badge pb-status-${normalizeStatus(feature.status)}">
            ${feature.status}
          </span>
          ${feature.product ? `<span class="pb-product-tag">${escapeHtml(feature.product)}</span>` : ''}
          ${feature.type ? `<span class="pb-type-tag">${feature.type}</span>` : ''}
        </div>
      </div>
      <button type="button" class="pb-btn-link" data-feature-id="${feature.id}">
        Link
      </button>
    </div>
  `).join('');
  
  container.innerHTML = html;
  
  // Add click handlers
  container.querySelectorAll('.pb-btn-link').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const featureId = e.target.dataset.featureId;
      const feature = results.find(f => f.id === featureId);
      if (feature && onResultClick) {
        onResultClick(feature);
      }
    });
  });
}

/**
 * Normalize status for CSS class
 */
function normalizeStatus(status) {
  return (status || '').toLowerCase().replace(/\s+/g, '-');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Clear search results and show default hint
 * @param {HTMLElement} container - Either the results container
 *                                  or the whole modal container
 */
export function clearSearchResults(container) {
  if (!container) return;

  // If they passed the whole modal, find the results area inside it
  let resultsContainer = container;
  if (!resultsContainer.classList.contains('pb-search-results')) {
    resultsContainer = container.querySelector('.pb-search-results');
  }

  if (!resultsContainer) return;

  resultsContainer.innerHTML =
    '<div class="pb-search-hint">Type at least 2 characters to search...</div>';

  // Also clear any pending debounce timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
}
