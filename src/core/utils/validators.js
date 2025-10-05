/**
 * Validation utilities
 */

/**
 * Validate email format
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate time format (HH:MM)
 */
export function isValidTime(time) {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

/**
 * Validate day format (9, 10, 11)
 */
export function isValidDay(day) {
  return ['9', '10', '11'].includes(String(day));
}

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Escape special characters for safe HTML insertion
 */
export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Validate required fields
 */
export function validateRequired(value, fieldName = 'Campo') {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    return {
      valid: false,
      error: `${fieldName} es requerido`,
    };
  }
  return { valid: true };
}

/**
 * Validate string length
 */
export function validateLength(value, min = 0, max = Infinity, fieldName = 'Campo') {
  const length = value ? value.length : 0;

  if (length < min) {
    return {
      valid: false,
      error: `${fieldName} debe tener al menos ${min} caracteres`,
    };
  }

  if (length > max) {
    return {
      valid: false,
      error: `${fieldName} no puede tener más de ${max} caracteres`,
    };
  }

  return { valid: true };
}
