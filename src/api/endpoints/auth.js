/**
 * Authentication API endpoints
 */

import { apiClient } from '../client.js';

export class AuthApi {
  /**
   * Login
   */
  static async login(username, password) {
    const data = await apiClient.post('/login', {
      username,
      password,
    });

    if (data.token) {
      sessionStorage.setItem('token', data.token);
    }

    return data;
  }

  /**
   * Logout
   */
  static logout() {
    sessionStorage.removeItem('token');
    apiClient.clearCache();
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated() {
    return !!sessionStorage.getItem('token');
  }

  /**
   * Get current token
   */
  static getToken() {
    return sessionStorage.getItem('token');
  }

  /**
   * Verify token is valid
   */
  static async verifyToken() {
    try {
      // This would call a verify endpoint if it exists
      // For now, just check if token exists
      return this.isAuthenticated();
    } catch (error) {
      this.logout();
      return false;
    }
  }
}
