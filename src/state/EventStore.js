/**
 * Event Store
 * Centralized state management for events
 * This pattern will map directly to Vuex/Pinia
 */

import { EventService } from '../core/services/EventService.js';
import { FilterService } from '../core/services/FilterService.js';
import { EventsApi } from '../api/endpoints/events.js';

export class EventStore {
  constructor() {
    this.eventService = new EventService();
    this.filterService = new FilterService();
    this.loading = false;
    this.error = null;
    this.listeners = new Map();
  }

  /**
   * Subscribe to state changes
   */
  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    return () => {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Emit event to listeners
   */
  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(callback => callback(data));
  }

  /**
   * Get state
   */
  getState() {
    return {
      events: this.eventService.getEvents(),
      filteredEvents: this.getFilteredEvents(),
      filters: this.filterService.getActiveFilters(),
      loading: this.loading,
      error: this.error,
    };
  }

  /**
   * Set loading state
   */
  setLoading(loading) {
    this.loading = loading;
    this.emit('loading', loading);
  }

  /**
   * Set error
   */
  setError(error) {
    this.error = error;
    this.emit('error', error);
  }

  /**
   * Load events
   */
  async loadEvents(isPublic = true) {
    this.setLoading(true);
    this.setError(null);

    try {
      const events = isPublic
        ? await EventsApi.getPublicEvents()
        : await EventsApi.getAllEvents();

      this.eventService.setEvents(events);
      this.emit('eventsLoaded', events);
      return events;
    } catch (error) {
      this.setError(error.message);
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Get filtered events
   */
  getFilteredEvents() {
    let events = this.eventService.getEvents();
    events = this.filterService.applyFilters(events);
    return events;
  }

  /**
   * Set filter
   */
  setFilter(type, value) {
    this.filterService.setFilter(type, value);
    this.emit('filtersChanged', this.filterService.getActiveFilters());
  }

  /**
   * Clear filters
   */
  clearFilters() {
    this.filterService.clearAll();
    this.emit('filtersChanged', {});
  }

  /**
   * Search events
   */
  searchEvents(query) {
    this.eventService.setSearchQuery(query);
    this.emit('searchChanged', query);
  }

  /**
   * Create event
   */
  async createEvent(eventData) {
    this.setLoading(true);
    this.setError(null);

    try {
      const event = await EventsApi.createEvent(eventData);
      this.eventService.addEvent(event);
      this.emit('eventCreated', event);
      return event;
    } catch (error) {
      this.setError(error.message);
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Update event
   */
  async updateEvent(id, eventData) {
    this.setLoading(true);
    this.setError(null);

    try {
      const event = await EventsApi.updateEvent(id, eventData);
      this.eventService.updateEvent(id, event);
      this.emit('eventUpdated', event);
      return event;
    } catch (error) {
      this.setError(error.message);
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Delete event
   */
  async deleteEvent(id) {
    this.setLoading(true);
    this.setError(null);

    try {
      await EventsApi.deleteEvent(id);
      this.eventService.deleteEvent(id);
      this.emit('eventDeleted', id);
    } catch (error) {
      this.setError(error.message);
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Bulk operations
   */
  async bulkCreate(events) {
    this.setLoading(true);
    this.setError(null);

    try {
      const result = await EventsApi.bulkCreate(events);
      await this.loadEvents(false);
      this.emit('bulkCreated', result);
      return result;
    } catch (error) {
      this.setError(error.message);
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  async bulkUpdate(updates) {
    this.setLoading(true);
    this.setError(null);

    try {
      const result = await EventsApi.bulkUpdate(updates);
      await this.loadEvents(false);
      this.emit('bulkUpdated', result);
      return result;
    } catch (error) {
      this.setError(error.message);
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  async bulkDelete(ids) {
    this.setLoading(true);
    this.setError(null);

    try {
      const result = await EventsApi.bulkDelete(ids);
      await this.loadEvents(false);
      this.emit('bulkDeleted', result);
      return result;
    } catch (error) {
      this.setError(error.message);
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Get filter options
   */
  getFilterOptions(filterType) {
    const events = this.eventService.getEvents();
    return this.filterService.getFilterOptions(events, filterType);
  }
}

// Create singleton instance
export const eventStore = new EventStore();
