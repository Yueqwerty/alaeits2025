/**
 * DashboardAPI.js
 * Gestión de llamadas a la API del dashboard
 *
 * Contiene:
 * - fetchWithCache: Fetch con sistema de cache
 * - loadInitialData: Carga inicial de datos
 * - loadEventsData/loadAnalyticsData: Carga específica de eventos y analytics
 * - updateEventAPI: Actualización de eventos
 * - updateEventPosition: Actualización de posición de eventos
 * - reloadData: Recarga de datos
 */

export const DashboardAPI = {
  /**
   * Fetch con sistema de cache
   * Almacena respuestas en cache por tiempo configurable
   *
   * @param {string} url - URL del endpoint
   * @param {Object} options - Opciones de fetch
   * @param {number} cacheTime - Tiempo de cache en ms (default: 30000)
   * @returns {Promise<Object>} Datos de la respuesta
   */
  async fetchWithCache(url, options = {}, cacheTime = 30000) {
    const cacheKey = `${url}:${JSON.stringify(options)}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < cacheTime) {
      return cached.data;
    }

    const headers = {
      'Authorization': `Bearer ${this.authToken}`,
      ...options.headers
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      if (response.status === 401) {
        this.handleAuthError();
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });

    return data;
  },

  /**
   * Carga inicial de datos del dashboard
   * Carga en paralelo eventos y analytics
   *
   * @returns {Promise<void>}
   */
  async loadInitialData() {
    this.state.loading = true;

    try {
      const [dataResponse, analyticsResponse] = await Promise.all([
        this.fetchWithCache('/api/admin/events'),
        this.fetchWithCache('/api/admin/analytics')
      ]);

      this.data.drafts = dataResponse.drafts || [];
      this.data.published = dataResponse.published || [];
      this.data.analytics = analyticsResponse;

    } catch (error) {
      throw error;
    } finally {
      this.state.loading = false;
    }
  },

  /**
   * Carga datos de eventos
   *
   * @returns {Promise<void>}
   */
  async loadEventsData() {
    const data = await this.fetchWithCache('/api/admin/events');
    this.data.drafts = data.drafts || [];
    this.data.published = data.published || [];
  },

  /**
   * Carga datos de analytics
   *
   * @returns {Promise<void>}
   */
  async loadAnalyticsData() {
    this.data.analytics = await this.fetchWithCache('/api/admin/analytics');
  },

  /**
   * Actualiza un evento vía API
   * Invalida cache y registra métricas de performance
   *
   * @param {string} eventId - ID del evento
   * @param {Object} updatedData - Datos actualizados
   * @returns {Promise<Object>} Resultado de la actualización
   */
  async updateEventAPI(eventId, updatedData) {
    const startTime = performance.now();

    try {
      const response = await fetch('/api/admin/event-manager', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({ eventId, updatedData }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      this.invalidateCache(['events', 'analytics']);
      this.performanceMetrics.lastApiCall = performance.now() - startTime;
      return result;

    } catch (error) {
      this.handleError('API Update Error', error);
      throw error;
    }
  },

  /**
   * Actualiza la posición de un evento en el schedule
   *
   * @param {string} eventId - ID del evento
   * @param {HTMLElement} container - Contenedor destino
   * @param {number} turnOrder - Orden de turno
   * @param {boolean} showNotification - Mostrar notificación
   * @returns {Promise<Object>} Resultado de la actualización
   */
  async updateEventPosition(eventId, container, turnOrder, showNotification = false) {
    const isDraft = container.id === 'draft-list';
    const updatedData = {
      status: isDraft ? 'borrador' : 'publicado',
      scheduled_day: isDraft ? null : container.dataset.day,
      scheduled_time_block: isDraft ? null : container.dataset.time,
      room: isDraft ? null : parseInt(container.dataset.room),
      turn_order: isDraft ? null : turnOrder,
    };

    console.log(`Actualizando evento ${eventId}:`, updatedData);
    const result = await this.updateEventAPI(eventId, updatedData);
    console.log(`Evento ${eventId} actualizado`);
    return result;
  },

  /**
   * Recarga datos del dashboard
   * Permite recargar selectivamente eventos y/o analytics
   *
   * @param {Array<string>} types - Tipos de datos a recargar: ['events', 'analytics']
   * @returns {Promise<void>}
   */
  async reloadData(types = ['events', 'analytics']) {
    const promises = [];

    if (types.includes('events')) {
      promises.push(this.loadEventsData());
    }

    if (types.includes('analytics')) {
      promises.push(this.loadAnalyticsData());
    }

    await Promise.all(promises);
  },

  /**
   * Sincroniza datos desde MDB
   * Busca nuevos eventos en la hoja de cálculo y los añade a pendientes
   *
   * @returns {Promise<void>}
   */
  async handleSyncMdb() {
    if (!confirm('Esto buscará nuevos eventos en la hoja de cálculo MBD y los añadirá a la lista de pendientes. ¿Continuar?')) {
        return;
    }

    // Deshabilitar el botón durante sync
    if (this.elements.syncMdbBtn) {
        this.elements.syncMdbBtn.disabled = true;
        this.elements.syncMdbBtn.innerHTML = '<span class="spinner"></span> Sincronizando...';
    }

    this.showLoading(true);
    this.showNotification('Iniciando sincronización...', 'info');

    try {
        const response = await fetch('/api/admin/sync-mdb', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.authToken}`
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Error en el servidor durante la sincronización.');
        }

        // Mostrar resultado más detallado
        if (result.addedCount > 0) {
            this.showNotification(`Sincronización exitosa: ${result.addedCount} nuevos eventos añadidos`, 'success');
        } else {
            this.showNotification('Sincronización completada: No se encontraron nuevos eventos', 'info');
        }

        // Recargar datos si hubo cambios
        if (result.addedCount > 0) {
            await this.reloadData(['events', 'analytics']);
            this.renderCurrentView();
        }

    } catch (error) {
        this.handleError('Sincronización MBD', error);
    } finally {
        this.showLoading(false);

        // Reactivar botón
        if (this.elements.syncMdbBtn) {
            this.elements.syncMdbBtn.disabled = false;
            this.elements.syncMdbBtn.innerHTML = '<i class="fas fa-sync"></i> Sincronizar MBD';
        }
    }
  }
};
