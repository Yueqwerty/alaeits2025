/**
 * Events API endpoints
 */

import { apiClient } from '../client.js';
import { Event } from '../../core/models/Event.js';

export class EventsApi {
  /**
   * Get all public events
   */
  static async getPublicEvents(filters = {}) {
    const data = await apiClient.get('/events-public', filters);
    return data.events.map(event => new Event(event));
  }

  /**
   * Get all events (admin)
   */
  static async getAllEvents(filters = {}) {
    const data = await apiClient.get('/admin/events', filters);
    return data.events.map(event => new Event(event));
  }

  /**
   * Get event by ID
   */
  static async getEventById(id) {
    const data = await apiClient.get(`/admin/events/${id}`);
    return new Event(data.event);
  }

  /**
   * Create event
   */
  static async createEvent(eventData) {
    const event = eventData instanceof Event ? eventData : new Event(eventData);
    const data = await apiClient.post('/admin/events', event.toApiFormat());
    return new Event(data.event);
  }

  /**
   * Update event
   */
  static async updateEvent(id, eventData) {
    const event = eventData instanceof Event ? eventData : new Event(eventData);
    const data = await apiClient.put(`/admin/events/${id}`, event.toApiFormat());
    return new Event(data.event);
  }

  /**
   * Delete event
   */
  static async deleteEvent(id) {
    return await apiClient.delete(`/admin/events/${id}`);
  }

  /**
   * Bulk create events
   */
  static async bulkCreate(events) {
    const eventsData = events.map(e =>
      e instanceof Event ? e.toApiFormat() : new Event(e).toApiFormat()
    );
    const data = await apiClient.post('/admin/bulk-operations/bulk-create', {
      events: eventsData,
    });
    return data;
  }

  /**
   * Bulk update events
   */
  static async bulkUpdate(updates) {
    const data = await apiClient.post('/admin/bulk-operations/bulk-update', {
      updates,
    });
    return data;
  }

  /**
   * Bulk delete events
   */
  static async bulkDelete(ids) {
    const data = await apiClient.post('/admin/bulk-operations/bulk-delete', {
      ids,
    });
    return data;
  }

  /**
   * Move event slot
   */
  static async moveSlot(eventId, newDay, newTime, newRoom) {
    const data = await apiClient.post('/admin/event-manager/move-slot', {
      eventId,
      newDay,
      newTime,
      newRoom,
    });
    return data;
  }

  /**
   * Swap event slots
   */
  static async swapSlots(eventId1, eventId2) {
    const data = await apiClient.post('/admin/event-manager/swap-slots', {
      eventId1,
      eventId2,
    });
    return data;
  }

  /**
   * Get available slots
   */
  static async getAvailableSlots(day = null, time = null) {
    const params = {};
    if (day) params.day = day;
    if (time) params.time = time;

    const data = await apiClient.get('/admin/event-manager/available-slots', params);
    return data.availableSlots;
  }
}
