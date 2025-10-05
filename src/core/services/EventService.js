/**
 * Event Service
 * Business logic layer for event operations
 */

import { Event } from '../models/Event.js';
import { FILTER_TYPES } from '../constants.js';

export class EventService {
  constructor() {
    this.events = [];
    this.filters = {};
    this.searchQuery = '';
  }

  /**
   * Set events
   */
  setEvents(events) {
    this.events = events.map(e => e instanceof Event ? e : new Event(e));
  }

  /**
   * Get all events
   */
  getEvents() {
    return this.events;
  }

  /**
   * Get filtered events
   */
  getFilteredEvents() {
    let filtered = [...this.events];

    // Apply filters
    if (Object.keys(this.filters).length > 0) {
      filtered = filtered.filter(event => event.matchesFilters(this.filters));
    }

    // Apply search
    if (this.searchQuery) {
      filtered = filtered.filter(event => event.matchesSearch(this.searchQuery));
    }

    return filtered;
  }

  /**
   * Set filter
   */
  setFilter(type, value) {
    if (value === null || value === undefined || value === '') {
      delete this.filters[type];
    } else {
      this.filters[type] = value;
    }
  }

  /**
   * Clear filters
   */
  clearFilters() {
    this.filters = {};
    this.searchQuery = '';
  }

  /**
   * Set search query
   */
  setSearchQuery(query) {
    this.searchQuery = query;
  }

  /**
   * Get event by ID
   */
  getEventById(id) {
    return this.events.find(e => e.id === id);
  }

  /**
   * Add event
   */
  addEvent(eventData) {
    const event = eventData instanceof Event ? eventData : new Event(eventData);
    this.events.push(event);
    return event;
  }

  /**
   * Update event
   */
  updateEvent(id, eventData) {
    const index = this.events.findIndex(e => e.id === id);
    if (index === -1) return null;

    const updatedEvent = new Event({ ...this.events[index], ...eventData });
    this.events[index] = updatedEvent;
    return updatedEvent;
  }

  /**
   * Delete event
   */
  deleteEvent(id) {
    const index = this.events.findIndex(e => e.id === id);
    if (index === -1) return false;

    this.events.splice(index, 1);
    return true;
  }

  /**
   * Get unique values for filters
   */
  getUniqueValues(field) {
    const values = new Set();
    this.events.forEach(event => {
      if (event[field]) {
        values.add(event[field]);
      }
    });
    return Array.from(values).sort();
  }

  /**
   * Get days with events
   */
  getDays() {
    return this.getUniqueValues('dia');
  }

  /**
   * Get times with events
   */
  getTimes() {
    return this.getUniqueValues('hora');
  }

  /**
   * Get rooms with events
   */
  getRooms() {
    return this.getUniqueValues('sala');
  }

  /**
   * Get types with events
   */
  getTypes() {
    return this.getUniqueValues('tipo');
  }

  /**
   * Get ejes with events
   */
  getEjes() {
    return this.getUniqueValues('eje');
  }

  /**
   * Group events by day
   */
  groupByDay() {
    const grouped = {};
    this.events.forEach(event => {
      if (!grouped[event.dia]) {
        grouped[event.dia] = [];
      }
      grouped[event.dia].push(event);
    });
    return grouped;
  }

  /**
   * Group events by time
   */
  groupByTime() {
    const grouped = {};
    this.events.forEach(event => {
      if (!grouped[event.hora]) {
        grouped[event.hora] = [];
      }
      grouped[event.hora].push(event);
    });
    return grouped;
  }

  /**
   * Group events by room
   */
  groupByRoom() {
    const grouped = {};
    this.events.forEach(event => {
      if (!grouped[event.sala]) {
        grouped[event.sala] = [];
      }
      grouped[event.sala].push(event);
    });
    return grouped;
  }

  /**
   * Get events count
   */
  getEventsCount() {
    return this.events.length;
  }

  /**
   * Get filtered events count
   */
  getFilteredEventsCount() {
    return this.getFilteredEvents().length;
  }

  /**
   * Check if slot is available
   */
  isSlotAvailable(day, time, room, excludeEventId = null) {
    return !this.events.some(event =>
      event.dia === day &&
      event.hora === time &&
      event.sala === room &&
      event.id !== excludeEventId
    );
  }

  /**
   * Get events in slot
   */
  getEventsInSlot(day, time, room) {
    return this.events.filter(event =>
      event.dia === day &&
      event.hora === time &&
      event.sala === room
    );
  }

  /**
   * Sort events
   */
  sortEvents(field = 'dia', order = 'asc') {
    return [...this.events].sort((a, b) => {
      const aVal = a[field] || '';
      const bVal = b[field] || '';

      if (order === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }
}
