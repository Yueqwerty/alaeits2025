/**
 * Application Constants
 * Centralizes all magic numbers and configuration values
 */

export const APP_CONFIG = {
  // API Configuration
  API_BASE_URL: '/api',
  API_TIMEOUT: 30000,
  CACHE_TTL: 30000,

  // UI Timings
  DEBOUNCE_DELAY: 300,
  NOTIFICATION_DURATION: 3000,
  ANIMATION_DURATION: 200,

  // Virtual Scrolling
  VIRTUAL_SCROLL_THRESHOLD: 100,
  ITEM_HEIGHT: 80,

  // Room Configuration
  TOTAL_ROOMS: 30,
  ROOM_CAPACITY: 6,

  // Pagination
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 200,
};

export const SCHEDULE_BLOCKS = [
  { time: '08:30', label: 'Bloque 1 - 08:30' },
  { time: '09:00', label: 'Bloque 2 - 09:00' },
  { time: '09:30', label: 'Bloque 3 - 09:30' },
  { time: '10:00', label: 'Bloque 4 - 10:00' },
  { time: '10:30', label: 'Bloque 5 - 10:30' },
  { time: '11:00', label: 'Café - 11:00' },
  { time: '11:30', label: 'Bloque 6 - 11:30' },
  { time: '12:00', label: 'Bloque 7 - 12:00' },
  { time: '12:30', label: 'Bloque 8 - 12:30' },
  { time: '13:00', label: 'Bloque 9 - 13:00' },
  { time: '13:30', label: 'Almuerzo - 13:30' },
  { time: '15:00', label: 'Bloque 10 - 15:00' },
  { time: '15:30', label: 'Bloque 11 - 15:30' },
];

export const EVENT_STATUS = {
  DRAFT: 'borrador',
  PUBLISHED: 'publicado',
};

export const EVENT_TYPES = {
  CONFERENCE: 'conferencia',
  WORKSHOP: 'taller',
  POSTER: 'poster',
  KEYNOTE: 'keynote',
};

export const FILTER_TYPES = {
  DAY: 'day',
  TIME: 'time',
  ROOM: 'room',
  SPECIFIC_ROOM: 'specific_room',
  VENUE: 'venue',
  TYPE: 'type',
  EJE: 'eje',
};

export const DAYS = ['9', '10', '11'];

export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warning',
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};
