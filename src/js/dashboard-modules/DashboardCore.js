/**
 * DashboardCore.js
 * Funciones core de gestión de estado y reactividad del dashboard
 *
 * Contiene:
 * - createReactiveData/createReactiveState: Sistema de reactividad con Proxy
 * - onDataChange/onStateChange: Manejadores de cambios reactivos
 * - scheduleRender: Programador de renderizado batch con requestAnimationFrame
 * - cacheElements: Sistema de cacheo de elementos DOM
 * - getScheduleBlocks: Configuración de bloques de horarios
 */

export const DashboardCore = {
  /**
   * Crea un objeto reactivo para data usando Proxy
   * Cuando cambian propiedades, se dispara onDataChange
   *
   * @param {Object} data - Objeto inicial de datos
   * @returns {Proxy} Objeto reactivo
   */
  createReactiveData(data) {
    return new Proxy(data, {
      set: (target, property, value) => {
        target[property] = value;
        this.onDataChange(property, value);
        return true;
      }
    });
  },

  /**
   * Crea un objeto reactivo para state usando Proxy
   * Cuando cambian propiedades, se dispara onStateChange
   *
   * @param {Object} state - Objeto inicial de estado
   * @returns {Proxy} Objeto reactivo
   */
  createReactiveState(state) {
    return new Proxy(state, {
      set: (target, property, value) => {
        const oldValue = target[property];
        target[property] = value;
        this.onStateChange(property, value, oldValue);
        return true;
      }
    });
  },

  /**
   * Manejador de cambios en data
   * Re-renderiza las vistas correspondientes cuando cambian los datos
   *
   * @param {string} property - Propiedad que cambió
   * @param {*} value - Nuevo valor
   */
  onDataChange(property, value) {
    if (property === 'analytics' && this.state.currentView === 'dashboard') {
      this.scheduleRender(() => this.renderDashboard());
    }
    else if (property === 'searchResults') {
      this.scheduleRender(() => this.renderSearchResults());
    } else if (['drafts', 'published'].includes(property)) {
      if (this.state.currentView === 'schedule') {
          this.scheduleRender(() => this.renderScheduleView());
      }
    }
  },

  /**
   * Manejador de cambios en state
   * Actualiza UI cuando cambia el estado
   *
   * @param {string} property - Propiedad que cambió
   * @param {*} value - Nuevo valor
   * @param {*} oldValue - Valor anterior
   */
  onStateChange(property, value, oldValue) {
    if (property === 'loading') {
      this.showLoading(value);
    } else if (property === 'currentView' && value !== oldValue) {
      this.scheduleRender(() => this.renderCurrentView());
    }
  },

  /**
   * Programador de renderizado batch
   * Usa requestAnimationFrame para agrupar renderizados y mejorar performance
   *
   * @param {Function} callback - Función de renderizado a ejecutar
   */
  scheduleRender(callback) {
    if (this.renderScheduled) return;

    this.renderScheduled = true;
    requestAnimationFrame(() => {
      callback();
      this.renderScheduled = false;
    });
  },

  /**
   * Sistema de caching de elementos DOM
   * Define getters lazy para elementos del DOM que se cachean al primer acceso
   * Mejora performance al evitar múltiples querySelector
   */
  cacheElements() {
    const selectors = {
      navItems: '.nav-item',
      viewContainers: '.view-container',
      logoutBtn: '#logout-btn',
      analyticsContainer: '#analytics-container',
      metricsGrid: '#metrics-grid',
      chartsContainer: '#charts-container',
      draftListEl: '#draft-list',
      gridEl: '#schedule-grid',
      dayFilterEl: '#day-filter',
      searchInput: '#search-input',
      searchFilters: '#search-filters',
      searchResults: '#search-results',
      bulkActionsBar: '#bulk-actions-bar',
      bulkModeBtn: '#bulk-mode-btn',
      selectAllBtn: '#select-all-btn',
      bulkOperationSelect: '#bulk-operation',
      applyBulkBtn: '#apply-bulk-btn',
      eventModal: '#event-modal',
      eventModalContent: '#event-modal-content',
      loadingOverlay: '#loading-overlay',
      syncMdbBtn: '#sync-mdb-btn',
      validationGrid: '#validation-grid',
      validationDayFilter: '#validation-day-filter',
      conflictsCount: '#conflicts-count',
      conflictsSummary: '#conflicts-summary'
    };

    Object.entries(selectors).forEach(([key, selector]) => {
      Object.defineProperty(this.elements, key, {
        get: () => {
          if (!this.elements[`_${key}`]) {
            const element = selector.startsWith('#')
              ? document.getElementById(selector.slice(1))
              : document.querySelectorAll(selector);

            if (element && (element.nodeType || element.length > 0)) {
              this.elements[`_${key}`] = element;
            } else {
              return null;
            }
          }
          return this.elements[`_${key}`];
        },
        configurable: true
      });
    });
  },

  /**
   * Obtiene la configuración de bloques de horarios del congreso
   * Define los días, horarios y número de salas disponibles
   *
   * @returns {Object} Configuración frozen de bloques de horarios
   */
  getScheduleBlocks() {
    return Object.freeze({
      'martes 14 de octubre': Object.freeze([
        '08:30 - 10:10', '10:20 - 12:00', '12:10 - 13:50',
        '15:00 - 16:40', '16:50 - 18:30'
      ]),
      'miércoles 15 de octubre': Object.freeze([
        '08:30 - 10:10', '10:20 - 12:00',
        '12:10 - 13:50', '14:00 - 15:30'
      ]),
      salas: 30
    });
  },

  /**
   * Actualización batch de DOM
   * Usa requestAnimationFrame para agrupar actualizaciones del DOM
   *
   * @param {Function} callback - Función con operaciones DOM
   */
  batchDOMUpdate(callback) {
    requestAnimationFrame(callback);
  }
};
