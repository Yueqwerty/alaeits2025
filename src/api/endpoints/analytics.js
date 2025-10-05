/**
 * Analytics API endpoints
 */

import { apiClient } from '../client.js';

export class AnalyticsApi {
  /**
   * Get dashboard metrics
   */
  static async getMetrics() {
    const data = await apiClient.get('/admin/analytics/metrics');
    return data;
  }

  /**
   * Get event distribution
   */
  static async getDistribution() {
    const data = await apiClient.get('/admin/analytics/distribution');
    return data;
  }

  /**
   * Get events by status
   */
  static async getByStatus() {
    const data = await apiClient.get('/admin/analytics/by-status');
    return data;
  }

  /**
   * Get events by type
   */
  static async getByType() {
    const data = await apiClient.get('/admin/analytics/by-type');
    return data;
  }

  /**
   * Get room occupancy
   */
  static async getRoomOccupancy() {
    const data = await apiClient.get('/admin/analytics/room-occupancy');
    return data;
  }
}
