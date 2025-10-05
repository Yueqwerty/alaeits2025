/**
 * HTTP Client
 * Base API client for all HTTP requests
 */

import { APP_CONFIG, HTTP_STATUS } from '../core/constants.js';

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export class ApiClient {
  constructor(baseURL = APP_CONFIG.API_BASE_URL) {
    this.baseURL = baseURL;
    this.timeout = APP_CONFIG.API_TIMEOUT;
    this.cache = new Map();
    this.cacheConfig = {
      enabled: true,
      ttl: APP_CONFIG.CACHE_TTL,
    };
  }

  /**
   * Get auth token from session storage
   */
  getAuthToken() {
    return sessionStorage.getItem('token');
  }

  /**
   * Set default headers
   */
  getHeaders(customHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    const token = this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Build full URL
   */
  buildUrl(endpoint) {
    return `${this.baseURL}${endpoint}`;
  }

  /**
   * Get cache key
   */
  getCacheKey(method, url, params) {
    return `${method}:${url}:${JSON.stringify(params)}`;
  }

  /**
   * Get from cache
   */
  getFromCache(key) {
    if (!this.cacheConfig.enabled) return null;

    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.cacheConfig.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Set to cache
   */
  setToCache(key, data) {
    if (!this.cacheConfig.enabled) return;

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache
   */
  clearCache(pattern = null) {
    if (pattern) {
      const keys = Array.from(this.cache.keys());
      keys.forEach(key => {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      });
    } else {
      this.cache.clear();
    }
  }

  /**
   * Make HTTP request with timeout
   */
  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new ApiError('Request timeout', 408);
      }
      throw error;
    }
  }

  /**
   * Handle response
   */
  async handleResponse(response) {
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');

    let data;
    if (isJson) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      throw new ApiError(
        data.message || data.error || 'Request failed',
        response.status,
        data
      );
    }

    return data;
  }

  /**
   * GET request
   */
  async get(endpoint, params = {}, options = {}) {
    const url = new URL(this.buildUrl(endpoint), window.location.origin);

    // Add query parameters
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined) {
        url.searchParams.append(key, params[key]);
      }
    });

    // Check cache
    const cacheKey = this.getCacheKey('GET', endpoint, params);
    const cached = this.getFromCache(cacheKey);
    if (cached && !options.skipCache) {
      return cached;
    }

    const response = await this.fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers: this.getHeaders(options.headers),
    });

    const data = await this.handleResponse(response);

    // Cache successful response
    if (!options.skipCache) {
      this.setToCache(cacheKey, data);
    }

    return data;
  }

  /**
   * POST request
   */
  async post(endpoint, body = {}, options = {}) {
    const url = this.buildUrl(endpoint);

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: this.getHeaders(options.headers),
      body: JSON.stringify(body),
    });

    const data = await this.handleResponse(response);

    // Invalidate cache for this endpoint
    this.clearCache(endpoint);

    return data;
  }

  /**
   * PUT request
   */
  async put(endpoint, body = {}, options = {}) {
    const url = this.buildUrl(endpoint);

    const response = await this.fetchWithTimeout(url, {
      method: 'PUT',
      headers: this.getHeaders(options.headers),
      body: JSON.stringify(body),
    });

    const data = await this.handleResponse(response);

    // Invalidate cache for this endpoint
    this.clearCache(endpoint);

    return data;
  }

  /**
   * DELETE request
   */
  async delete(endpoint, options = {}) {
    const url = this.buildUrl(endpoint);

    const response = await this.fetchWithTimeout(url, {
      method: 'DELETE',
      headers: this.getHeaders(options.headers),
    });

    const data = await this.handleResponse(response);

    // Invalidate cache for this endpoint
    this.clearCache(endpoint);

    return data;
  }

  /**
   * Upload file
   */
  async upload(endpoint, formData, options = {}) {
    const url = this.buildUrl(endpoint);

    const headers = { ...options.headers };
    const token = this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    return await this.handleResponse(response);
  }
}

// Create singleton instance
export const apiClient = new ApiClient();
