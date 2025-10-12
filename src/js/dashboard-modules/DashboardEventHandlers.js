/**
 * DashboardEventHandlers.js
 * Gestión de event listeners y manejadores de eventos del dashboard
 *
 * Contiene:
 * - setupEventListeners: Configura todos los listeners del dashboard
 * - handleDelegatedClick/Change/Input: Event delegation handlers
 * - handleKeyboardShortcuts: Atajos de teclado
 * - handleResize/handleLogout: Handlers específicos
 * - setupIntersectionObserver/handleIntersection: Lazy loading
 */

export const DashboardEventHandlers = {
  /**
   * Configura todos los event listeners del dashboard
   * Usa event delegation para mejor performance
   *
   * @returns {Promise<void>}
   */
  setupEventListeners() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
      return Promise.resolve();
    }

    document.addEventListener('click', (e) => {
      try {
        this.handleDelegatedClick(e);
      } catch (error) {
        console.error('Click handler error:', error);
      }
    });

    document.addEventListener('change', (e) => {
      try {
        this.handleDelegatedChange(e);
      } catch (error) {
        console.error('Change handler error:', error);
      }
    });

    document.addEventListener('input', (e) => {
      try {
        this.handleDelegatedInput(e);
      } catch (error) {
        console.error('Input handler error:', error);
      }
    });

    document.addEventListener('keydown', (e) => {
      try {
        this.handleKeyboardShortcuts(e);
      } catch (error) {
        console.error('Keyboard handler error:', error);
      }
    });

    window.addEventListener('beforeunload', () => {
      try {
        this.cleanup();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    });

    window.addEventListener('resize', this.debounce('resize', () => {
      try {
        this.handleResize();
      } catch (error) {
        console.error('Resize handler error:', error);
      }
    }, 250));

    return Promise.resolve();
  },

  /**
   * Manejador delegado de clicks
   * Usa event delegation para manejar clicks en todo el documento
   *
   * @param {Event} e - Evento de click
   */
  handleDelegatedClick(e) {
    const target = e.target;
    const closest = target.closest.bind(target);

    if (closest('.nav-item')) {
      e.preventDefault();
      const view = closest('.nav-item').dataset.view;
      this.switchView(view);
      return;
    }

    if (closest('.event-card') && !this.state.isDragging) {
      const eventId = closest('.event-card').dataset.id;
      this.showEventDetails(eventId);
      return;
    }

    if (target.matches('.close-btn') || target === this.elements.eventModal) {
      this.closeEventModal();
      return;
    }

    if (target === this.elements.syncMdbBtn) {
      this.handleSyncMdb();
      return;
    }

    if (target.id === 'toggle-multiselect-btn' || target === this.elements.toggleMultiselectBtn) {
      this.toggleMultiSelectMode();
      return;
    }

    if (target === this.elements.bulkModeBtn) {
      this.toggleBulkMode();
      return;
    }

    if (target === this.elements.selectAllBtn) {
      this.toggleSelectAll();
      return;
    }

    if (target === this.elements.applyBulkBtn) {
      this.applyBulkOperation();
      return;
    }

    if (target === this.elements.logoutBtn) {
      this.handleLogout();
      return;
    }
  },

  /**
   * Manejador delegado de cambios
   * Maneja eventos change en selects y checkboxes
   *
   * @param {Event} e - Evento de change
   */
  handleDelegatedChange(e) {
    const target = e.target;

    if (target === this.elements.dayFilterEl) {
      this.scheduleRender(() => this.renderSchedule());
      return;
    }

    if (target === this.elements.validationDayFilter) {
      this.scheduleRender(() => this.renderValidationView());
      return;
    }

    if (target.closest('#search-filters')) {
      this.state.filters[target.name] = target.value;
      this.debouncedSearch();
      return;
    }

    if (target.matches('input[type="checkbox"]') && target.closest('.search-result-card')) {
      const eventId = target.closest('.search-result-card').dataset.id;
      this.toggleEventSelection(eventId);
      return;
    }
  },

  /**
   * Manejador delegado de input
   * Maneja eventos input en campos de texto
   *
   * @param {Event} e - Evento de input
   */
  handleDelegatedInput(e) {
    const target = e.target;

    if (target === this.elements.searchInput) {
      this.state.filters.search = target.value;
      this.debouncedSearch();
      return;
    }
  },

  /**
   * Manejador de atajos de teclado
   * Atajos disponibles:
   * - Ctrl+F: Abrir búsqueda
   * - Ctrl+A: Seleccionar todo (en modo bulk)
   * - Ctrl+S: Actualizar schedule
   * - Escape: Cerrar modales / salir de modo bulk
   * - 1/2/3: Cambiar entre vistas
   *
   * @param {KeyboardEvent} e - Evento de teclado
   */
  handleKeyboardShortcuts(e) {
    if (!e.key) return; // Ignorar eventos sin tecla definida

    const shortcuts = {
      'ctrl+f': () => {
        e.preventDefault();
        if (this.elements.searchInput) {
          this.switchView('search');
          setTimeout(() => this.elements.searchInput.focus(), 100);
        }
      },
      'ctrl+a': () => {
        if (this.state.bulkMode && this.state.currentView === 'search') {
          e.preventDefault();
          this.toggleSelectAll();
        }
      },
      'ctrl+s': () => {
        if (this.state.currentView === 'schedule') {
          e.preventDefault();
          this.renderScheduleView();
        }
      },
      'escape': () => {
        this.closeEventModal();
        if (this.state.bulkMode) {
          this.toggleBulkMode();
        }
      },
      '1': () => this.switchView('dashboard'),
      '2': () => this.switchView('schedule'),
      '3': () => this.switchView('search')
    };

    const key = [
      e.ctrlKey && 'ctrl',
      e.metaKey && 'meta',
      e.altKey && 'alt',
      e.shiftKey && 'shift',
      e.key.toLowerCase()
    ].filter(Boolean).join('+');

    const handler = shortcuts[key];
    if (handler && (!e.ctrlKey || ['ctrl+f', 'ctrl+a', 'ctrl+s'].includes(key))) {
      handler();
    }
  },

  /**
   * Manejador de resize de ventana
   * Actualiza visuales de slots cuando cambia el tamaño
   */
  handleResize() {
    if (this.state.currentView === 'schedule') {
      this.updateSlotVisuals();
    }
  },

  /**
   * Manejador de logout
   * Confirma y cierra sesión del usuario
   */
  handleLogout() {
    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
      sessionStorage.clear();
      window.location.href = 'login.html';
    }
  },

  /**
   * Configura Intersection Observer para lazy loading
   * Permite cargar contenido cuando entra en viewport
   *
   * @returns {Promise<void>}
   */
  setupIntersectionObserver() {
    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver(
        this.handleIntersection.bind(this),
        { threshold: 0.1, rootMargin: '50px' }
      );
    }
    return Promise.resolve();
  },

  /**
   * Manejador de intersección para lazy loading
   * Carga contenido cuando elementos entran en viewport
   *
   * @param {Array<IntersectionObserverEntry>} entries - Entries observadas
   */
  handleIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        if (element.dataset.lazyLoad) {
          this.loadLazyContent(element);
        }
      }
    });
  },

  /**
   * Carga contenido lazy de un elemento
   *
   * @param {HTMLElement} element - Elemento a cargar
   */
  loadLazyContent(element) {
    const src = element.dataset.src;
    if (src) {
      element.src = src;
      element.removeAttribute('data-lazy-load');
    }
  }
};
