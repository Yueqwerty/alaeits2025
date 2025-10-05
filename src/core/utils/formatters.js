/**
 * Formatting utilities
 */

/**
 * Format date to locale string
 */
export function formatDate(date, locale = 'es-ES') {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString(locale);
}

/**
 * Format time to HH:MM
 */
export function formatTime(time) {
  if (!time) return '';
  return time.substring(0, 5);
}

/**
 * Format authors list
 */
export function formatAuthors(authors) {
  if (!authors) return '';
  return authors.trim().replace(/\s*,\s*/g, ', ');
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text, maxLength = 100, suffix = '...') {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - suffix.length).trim() + suffix;
}

/**
 * Capitalize first letter
 */
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convert snake_case to camelCase
 */
export function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase to snake_case
 */
export function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Convert object keys from snake_case to camelCase
 */
export function keysToCamel(obj) {
  if (Array.isArray(obj)) {
    return obj.map(v => keysToCamel(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      result[snakeToCamel(key)] = keysToCamel(obj[key]);
      return result;
    }, {});
  }
  return obj;
}

/**
 * Convert object keys from camelCase to snake_case
 */
export function keysToSnake(obj) {
  if (Array.isArray(obj)) {
    return obj.map(v => keysToSnake(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      result[camelToSnake(key)] = keysToSnake(obj[key]);
      return result;
    }, {});
  }
  return obj;
}
