// productboard/error_handler.js
// Centralized error handling for ProductBoard operations

/**
 * Handle PocketBase errors with user-friendly messages
 * @param {Error} error - The error object
 * @param {string} operation - Description of what operation failed
 * @returns {string} User-friendly error message
 */
export function handleProductBoardError(error, operation = 'operation') {
  console.error(`[ProductBoard Error] ${operation}:`, error);
  
  // Check for specific error types
  if (error.status === 401 || error.status === 403 || error.status === 400) {
    return 'Not authorized';
  }
  
  if (error.status === 404) {
    return `Resource not found`;
  }
  
  if (error.status === 500) {
    return `Server error. Please try again later`;
  }
  
  if (error.isAbort) {
    return null; // Don't show error for aborted requests
  }
  
  if (!navigator.onLine) {
    return `No internet connection`;
  }
  
  // Generic error
  return `Failed: ${error.message || 'Unknown error'}`;
}

/**
 * Show error notification to user
 * @param {string} message - Error message to display
 * @param {number} duration - How long to show (ms)
 */
export function showErrorNotification(message, duration = 5000) {
  if (!message) return; // Don't show null messages (aborted requests)
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'pb-error-notification';
  notification.innerHTML = `
    <div class="pb-error-icon">⚠️</div>
    <div class="pb-error-message">${escapeHtml(message)}</div>
    <button class="pb-error-close" aria-label="Close">×</button>
  `;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => notification.classList.add('show'), 10);
  
  // Close button
  notification.querySelector('.pb-error-close').addEventListener('click', () => {
    closeNotification(notification);
  });
  
  // Auto-close
  setTimeout(() => {
    closeNotification(notification);
  }, duration);
}

/**
 * Show success notification
 * @param {string} message - Success message
 * @param {number} duration - How long to show (ms)
 */
export function showSuccessNotification(message, duration = 3000) {
  const notification = document.createElement('div');
  notification.className = 'pb-success-notification';
  notification.innerHTML = `
    <div class="pb-success-icon">✓</div>
    <div class="pb-success-message">${escapeHtml(message)}</div>
  `;
  
  document.body.appendChild(notification);
  setTimeout(() => notification.classList.add('show'), 10);
  
  setTimeout(() => {
    closeNotification(notification);
  }, duration);
}

/**
 * Close notification with animation
 */
function closeNotification(notification) {
  notification.classList.remove('show');
  setTimeout(() => notification.remove(), 300);
}

/**
 * Check if user is authorized
 * @param {Object} pb - PocketBase instance
 * @returns {boolean}
 */
export function isAuthorized(pb) {
  return pb && pb.authStore && pb.authStore.isValid;
}

/**
 * Show authorization error and optionally redirect to login
 */
export function showAuthorizationError(redirectToLogin = false) {
  showErrorNotification('Your session has expired. Please log in again.');
  
  if (redirectToLogin) {
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 2000);
  }
}

/**
 * Retry operation with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Initial delay in ms
 */
export async function retryOperation(operation, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      // Don't retry auth errors or 404s
      if (error.status === 401 || error.status === 403 || error.status === 404) {
        throw error;
      }
      
      if (i === maxRetries - 1) {
        throw error; // Last attempt failed
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}