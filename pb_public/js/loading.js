// loading.js - Loading overlay management

let overlayElement = null;
let loadingCount = 0;

/**
 * Initialize the loading overlay (call once on page load)
 */
export function initLoadingOverlay() {
  if (overlayElement) return;
  
  overlayElement = document.createElement('div');
  overlayElement.className = 'loading-overlay hidden';
  overlayElement.innerHTML = `
    <div class="loading-spinner"></div>
    <div class="loading-text">Loading...</div>
    <div class="loading-subtext">Please wait</div>
  `;
  document.body.appendChild(overlayElement);
  
  console.log('[Loading] Overlay initialized');
}

/**
 * Show the loading overlay
 * @param {string} message - Optional message to display
 * @param {string} subtext - Optional subtext
 * @param {boolean} mini - Use mini/subtle version for quick operations
 */
export function showLoading(message = 'Loading...', subtext = 'Please wait', mini = false) {
  if (!overlayElement) initLoadingOverlay();
  
  loadingCount++;
  
  const textEl = overlayElement.querySelector('.loading-text');
  const subtextEl = overlayElement.querySelector('.loading-subtext');
  
  if (textEl) textEl.textContent = message;
  if (subtextEl) subtextEl.textContent = subtext;
  
  overlayElement.classList.toggle('mini', mini);
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
