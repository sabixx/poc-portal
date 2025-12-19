// loading.js - Modern Loading Overlay
// Works with both legacy HTML structure and new card-based structure

let overlayElement = null;
let loadingCount = 0;

/**
 * Initialize the loading overlay (call once on page load)
 * Creates the modern card-based structure
 */
export function initLoadingOverlay() {
  if (overlayElement) return;
  
  overlayElement = document.createElement('div');
  overlayElement.className = 'loading-overlay hidden';
  overlayElement.setAttribute('role', 'status');
  overlayElement.setAttribute('aria-live', 'polite');
  
  // Modern structure with card wrapper
  overlayElement.innerHTML = `
    <div class="loading-card">
      <div class="loading-spinner-container">
        <div class="loading-spinner"></div>
      </div>
      <div class="loading-content">
        <p class="loading-text">Loading...</p>
        <p class="loading-subtext">Please wait</p>
      </div>
      <div class="loading-progress">
        <div class="loading-progress-bar"></div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlayElement);
  console.log('[Loading] Overlay initialized (modern structure)');
}

/**
 * Show the loading overlay
 * @param {string} message - Main message to display
 * @param {string} subtext - Secondary description
 * @param {boolean} mini - Use mini/subtle version for quick operations
 */
export function showLoading(message = 'Loading...', subtext = 'Please wait', mini = false) {
  if (!overlayElement) initLoadingOverlay();
  
  loadingCount++;
  
  // Update text - handle both legacy and modern structure
  const textEl = overlayElement.querySelector('.loading-text');
  const subtextEl = overlayElement.querySelector('.loading-subtext');
  
  if (textEl) textEl.textContent = message;
  if (subtextEl) subtextEl.textContent = subtext;
  
  // Toggle mini mode
  overlayElement.classList.toggle('mini', mini);
  
  // Show overlay
  overlayElement.classList.remove('hidden');
  
  console.log('[Loading] Show:', message, '(count:', loadingCount, ')');
}

/**
 * Hide the loading overlay
 * @param {boolean} force - Force hide even if multiple show() calls were made
 */
export function hideLoading(force = false) {
  if (!overlayElement) return;
  
  if (force) {
    loadingCount = 0;
  } else {
    loadingCount = Math.max(0, loadingCount - 1);
  }
  
  if (loadingCount === 0) {
    overlayElement.classList.add('hidden');
    console.log('[Loading] Hidden');
  } else {
    console.log('[Loading] Still loading (count:', loadingCount, ')');
  }
}

/**
 * Update loading text without showing/hiding
 * @param {string} message - New message
 * @param {string} subtext - New subtext (optional)
 */
export function updateLoadingText(message, subtext) {
  if (!overlayElement) return;
  
  const textEl = overlayElement.querySelector('.loading-text');
  const subtextEl = overlayElement.querySelector('.loading-subtext');
  
  if (textEl && message) textEl.textContent = message;
  if (subtextEl && subtext !== undefined) subtextEl.textContent = subtext;
}

/**
 * Execute an async function with loading overlay
 * @param {Function} asyncFn - Async function to execute
 * @param {string} message - Loading message
 * @param {boolean} mini - Use mini version
 * @returns {Promise} - Result of asyncFn
 */
export async function withLoading(asyncFn, message = 'Loading...', mini = false) {
  showLoading(message, '', mini);
  try {
    return await asyncFn();
  } finally {
    hideLoading();
  }
}

/**
 * Show mini loading indicator (convenience function)
 * @param {string} message - Brief loading text
 */
export function showMiniLoading(message = 'Loading...') {
  showLoading(message, '', true);
}

// Export default for compatibility
export default {
  initLoadingOverlay,
  showLoading,
  hideLoading,
  updateLoadingText,
  withLoading,
  showMiniLoading
};