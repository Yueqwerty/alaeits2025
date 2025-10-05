/**
 * Utility functions for debouncing and throttling
 */

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds
 */
export function throttle(func, wait = 300) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), wait);
    }
  };
}

/**
 * Debounce with leading edge execution
 */
export function debounceLeading(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const callNow = !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = null;
    }, wait);
    if (callNow) func(...args);
  };
}
