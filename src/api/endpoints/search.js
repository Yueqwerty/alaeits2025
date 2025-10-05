/**
 * Search API endpoints
 */

import { apiClient } from '../client.js';
import { Event } from '../../core/models/Event.js';

export class SearchApi {
  /**
   * Search events
   */
  static async searchEvents(query, filters = {}) {
    const params = { query, ...filters };
    const data = await apiClient.get('/admin/search', params);
    return {
      events: data.events.map(event => new Event(event)),
      total: data.total,
    };
  }

  /**
   * Get search suggestions
   */
  static async getSuggestions(query) {
    const data = await apiClient.get('/admin/search/suggestions', { query });
    return data.suggestions;
  }

  /**
   * Advanced search
   */
  static async advancedSearch(criteria) {
    const data = await apiClient.post('/admin/search/advanced', criteria);
    return {
      events: data.events.map(event => new Event(event)),
      total: data.total,
    };
  }
}
