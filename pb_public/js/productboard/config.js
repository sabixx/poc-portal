// productboard/config.js
// ProductBoard Configuration

/**
 * ProductBoard importance levels with emoji indicators
 */
export const IMPORTANCE_LEVELS = {
  critical: { value: 'critical', label: 'Critical', dot: 'priority-dot priority-critical' },
  important: { value: 'important', label: 'Important', dot: 'priority-dot priority-important' },
  nice_to_have: { value: 'nice_to_have', label: 'Nice to have', dot: 'priority-dot priority-nice' },
  not_important: { value: 'not_important', label: 'Not important', dot: 'priority-dot priority-low' },
  unknown: { value: 'unknown', label: 'Unknown', dot: 'priority-dot priority-unknown' }
};

/**
 * Default importance level
 */
export const DEFAULT_IMPORTANCE = 'critical';

/**
 * Customer impact levels
 */
export const IMPACT_LEVELS = {
  blocker: { value: 'blocker', label: 'Blocker', color: '#dc2626' },
  high: { value: 'high', label: 'High', color: '#f59e0b' },
  medium: { value: 'medium', label: 'Medium', color: '#3b82f6' },
  low: { value: 'low', label: 'Low', color: '#6b7280' }
};

/**
 * Default impact level
 */
export const DEFAULT_IMPACT = 'medium';

/**
 * Number of recent features to show
 */
export const RECENT_FEATURES_LIMIT = 5;

/**
 * Search debounce delay (ms)
 */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Minimum search query length
 */
export const MIN_SEARCH_LENGTH = 2;
