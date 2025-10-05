/**
 * Filter Service
 * Manages filtering logic
 */

import { FILTER_TYPES } from '../constants.js';

export class FilterService {
  constructor() {
    this.activeFilters = new Map();
    this.listeners = [];
  }

  /**
   * Subscribe to filter changes
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify listeners
   */
  notify() {
    this.listeners.forEach(callback => callback(this.getActiveFilters()));
  }

  /**
   * Set filter
   */
  setFilter(type, value) {
    if (value === null || value === undefined || value === '') {
      this.activeFilters.delete(type);
    } else {
      this.activeFilters.set(type, value);
    }
    this.notify();
  }

  /**
   * Get filter
   */
  getFilter(type) {
    return this.activeFilters.get(type);
  }

  /**
   * Get all active filters
   */
  getActiveFilters() {
    return Object.fromEntries(this.activeFilters);
  }

  /**
   * Clear all filters
   */
  clearAll() {
    this.activeFilters.clear();
    this.notify();
  }

  /**
   * Clear specific filter
   */
  clearFilter(type) {
    this.activeFilters.delete(type);
    this.notify();
  }

  /**
   * Check if has active filters
   */
  hasActiveFilters() {
    return this.activeFilters.size > 0;
  }

  /**
   * Apply filters to events (optimizado)
   */
  applyFilters(events) {
    if (!this.hasActiveFilters()) {
      return events;
    }

    // Convertir Map a array para mejor performance
    const filtersArray = Array.from(this.activeFilters);

    return events.filter(event => {
      // Usar every para salir temprano si un filtro no coincide
      return filtersArray.every(([type, value]) => {
        switch (type) {
          case FILTER_TYPES.DAY:
            return event.dia === value;
          case FILTER_TYPES.TIME:
            return event.hora === value;
          case FILTER_TYPES.ROOM:
            return event.sala === value;
          case FILTER_TYPES.TYPE:
            return event.tipo === value;
          case FILTER_TYPES.EJE:
            return event.eje === value;
          default:
            return true;
        }
      });
    });
  }

  /**
   * Get filter options from events (optimizado con caché)
   */
  getFilterOptions(events, filterType) {
    const values = new Set();

    // Mapeo de tipos de filtro a propiedades de evento
    const propertyMap = {
      [FILTER_TYPES.DAY]: 'dia',
      [FILTER_TYPES.TIME]: 'hora',
      [FILTER_TYPES.ROOM]: 'sala',
      [FILTER_TYPES.TYPE]: 'tipo',
      [FILTER_TYPES.EJE]: 'eje'
    };

    const property = propertyMap[filterType];

    if (property) {
      events.forEach(event => {
        const value = event[property];
        if (value) {
          values.add(value);
        }
      });
    }

    return Array.from(values).sort((a, b) => {
      // Ordenamiento numérico para salas, alfabético para el resto
      if (filterType === FILTER_TYPES.ROOM) {
        return parseInt(a) - parseInt(b);
      }
      return a.localeCompare(b, 'es');
    });
  }
}
