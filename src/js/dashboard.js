class EnhancedCongressDashboard {
  constructor() {
    // Configuración inicial
    this.authToken = sessionStorage.getItem('authToken');
    this.isAuthenticated = sessionStorage.getItem('isAdminAuthenticated');
    
    // Estado de la aplicación con proxies para reactividad
    this.data = this.createReactiveData({
      drafts: [],
      published: [],
      analytics: null,
      searchResults: []
    });
    
    this.state = this.createReactiveState({
      currentView: 'dashboard',
      selectedEvents: new Set(),
      filters: {
        search: '',
        status: 'all',
        event_type: 'all',
        scheduled_day: 'all',
        room: 'all'
      },
      bulkMode: false,
      multiSelectMode: false, // Modo de selección múltiple para drag & drop
      loading: false,
      isDragging: false // Para optimizar drag operations
    });
    
    // Performance y cache
    this.cache = new Map();
    this.debounceTimers = new Map();
    this.intersectionObserver = null;
    this.performanceMetrics = {};
    
    // UI elements cache
    this.elements = {};
    this.sortableInstances = [];
    
    // Configuración de bloques de horarios
    this.scheduleBlocks = this.getScheduleBlocks();
    
    // Pool de elementos DOM reutilizables
    this.elementPool = {
      eventCards: [],
      notifications: []
    };

    // Rate limiting para notificaciones
    this.notificationThrottle = new Map();
    this.lastNotification = 0;
    
    this.init();
  }

  createReactiveData(data) {
    return new Proxy(data, {
      set: (target, property, value) => {
        target[property] = value;
        this.onDataChange(property, value);
        return true;
      }
    });
  }

  createReactiveState(state) {
    return new Proxy(state, {
      set: (target, property, value) => {
        const oldValue = target[property];
        target[property] = value;
        this.onStateChange(property, value, oldValue);
        return true;
      }
    });
  }

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
  }

  onStateChange(property, value, oldValue) {
    if (property === 'loading') {
      this.showLoading(value);
    } else if (property === 'currentView' && value !== oldValue) {
      this.scheduleRender(() => this.renderCurrentView());
    }
  }

  // Programador de renderizado batch
  scheduleRender(callback) {
    if (this.renderScheduled) return;
    
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      callback();
      this.renderScheduled = false;
    });
  }

  // Sistema de caching más seguro y eficiente
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
      syncMdbBtn: '#sync-mdb-btn'
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
  }

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
  }

  async init() {
    const startTime = performance.now();
    
    try {
      if (!this.authToken || this.isAuthenticated !== 'true') {
        window.location.href = 'login.html';
        return;
      }

      this.cacheElements();
      
      await Promise.all([
        this.setupEventListeners(),
        this.setupIntersectionObserver(),
        this.loadInitialData()
      ]);

      this.switchView('dashboard');
      
      this.performanceMetrics.initTime = performance.now() - startTime;
      console.log(`Dashboard initialized in ${this.performanceMetrics.initTime.toFixed(2)}ms`);
      
    } catch (error) {
      this.handleError('Error loading dashboard', error);
    }
  }

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
  }

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
  }

  // Event listeners optimizados con mejor error handling
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
  }

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
  }

  handleDelegatedChange(e) {
    const target = e.target;

    if (target === this.elements.dayFilterEl) {
      this.scheduleRender(() => this.renderSchedule());
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
  }

  handleDelegatedInput(e) {
    const target = e.target;

    if (target === this.elements.searchInput) {
      this.state.filters.search = target.value;
      this.debouncedSearch();
      return;
    }
  }

  handleKeyboardShortcuts(e) {
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
  }

  handleResize() {
    if (this.state.currentView === 'schedule') {
      this.updateSlotVisuals();
    }
  }

  handleLogout() {
    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
      sessionStorage.clear();
      window.location.href = 'login.html';
    }
  }

  setupIntersectionObserver() {
    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver(
        this.handleIntersection.bind(this),
        { threshold: 0.1, rootMargin: '50px' }
      );
    }
    return Promise.resolve();
  }

  handleIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        if (element.dataset.lazyLoad) {
          this.loadLazyContent(element);
        }
      }
    });
  }

  loadLazyContent(element) {
    const src = element.dataset.src;
    if (src) {
      element.src = src;
      element.removeAttribute('data-lazy-load');
    }
  }

  debounce(key, func, delay) {
    return (...args) => {
      clearTimeout(this.debounceTimers.get(key));
      this.debounceTimers.set(key, setTimeout(() => func.apply(this, args), delay));
    };
  }

  debouncedSearch = this.debounce('search', this.performSearch.bind(this), 300);

  // API optimizada con mejor error handling
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
  }

  async updateEventPosition(eventId, container, turnOrder, showNotification = false) {
    const isDraft = container.id === 'draft-list';
    const updatedData = {
      status: isDraft ? 'borrador' : 'publicado',
      scheduled_day: isDraft ? null : container.dataset.day,
      scheduled_time_block: isDraft ? null : container.dataset.time,
      room: isDraft ? null : parseInt(container.dataset.room),
      turn_order: isDraft ? null : turnOrder,
    };

    return await this.updateEventAPI(eventId, updatedData);
  }

  // Sistema de renderizado optimizado
  switchView(viewName) {
    if (this.state.currentView === viewName) return;
    
    this.batchDOMUpdate(() => {
      const navItems = this.elements.navItems;
      if (navItems && navItems.length) {
        Array.from(navItems).forEach(item => {
          item.classList.toggle('active', item.dataset.view === viewName);
        });
      }

      const viewContainers = this.elements.viewContainers;
      if (viewContainers && viewContainers.length) {
        Array.from(viewContainers).forEach(container => {
          container.classList.toggle('active', container.id === `${viewName}-view`);
        });
      }
    });

    this.state.currentView = viewName;
    this.renderCurrentView();
  }

  async renderCurrentView() {
    switch (this.state.currentView) {
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'schedule':
        this.renderScheduleView();
        break;
      case 'search':
        this.renderSearchView();
        // Ejecutar búsqueda inmediatamente si no hay resultados
        if (this.data.searchResults.length === 0) {
          await this.performSearch();
        } else {
          this.renderSearchResults();
        }
        break;
    }
  }

  batchDOMUpdate(callback) {
    requestAnimationFrame(callback);
  }

  // Dashboard rendering optimizado
  renderDashboard() {
    if (!this.data.analytics) {
      this.showNotification('Cargando datos del dashboard...', 'info');
      return;
    }

    if (window.Worker && this.data.analytics.summary.totalEvents > 1000) {
      this.renderDashboardWorker();
    } else {
      this.renderMetrics();
      this.renderCharts();
      this.renderRecentActivity();
    }
  }

  renderDashboardWorker() {
    console.log('Worker rendering not implemented, falling back to sync rendering');
    this.renderMetrics();
    this.renderCharts(); 
    this.renderRecentActivity();
  }

  renderMetrics() {
    if (!this.elements.metricsGrid) return;

    const { summary } = this.data.analytics;

    const metricsTemplate = `
      <div class="metric-card">
        <div class="metric-content">
          <div class="metric-value">${summary.totalEvents || 0}</div>
          <div class="metric-label">Total de Eventos</div>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-content">
          <div class="metric-value">${summary.totalScheduled || 0}</div>
          <div class="metric-label">Programados</div>
          <div class="metric-trend">${summary.completionRate || 0}% completado</div>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-content">
          <div class="metric-value">${summary.totalDrafts || 0}</div>
          <div class="metric-label">Pendientes</div>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-content">
          <div class="metric-value">${summary.overallUtilization || 0}%</div>
          <div class="metric-label">Ocupación de Salas</div>
        </div>
      </div>
    `;

    this.elements.metricsGrid.innerHTML = metricsTemplate;
  }

  renderCharts() {
    if (!this.elements.chartsContainer || !this.data.analytics) return;
    
    const { eventsByStatus, eventsByType, eventsByDay } = this.data.analytics;
    const totalEvents = this.data.analytics.summary.totalEvents || 1;
    
    const chartsHTML = `
      <div class="chart-container">
        <h3>Por Estado</h3>
        <div class="progress-chart">
          ${(eventsByStatus || []).map(item => `
            <div class="progress-item">
              <span class="progress-label">${item.status === 'publicado' ? 'Publicado' : 'Borrador'}</span>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${(item.count / totalEvents) * 100}%"></div>
              </div>
              <span class="progress-value">${item.count}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="chart-container">
        <h3>Por Tipo</h3>
        <div class="donut-chart">
          ${(eventsByType || []).map((item) => {
            let color, label;
            switch(item.event_type) {
              case 'ponencia':
                color = 'var(--ponencia-color)';
                label = 'Ponencia';
                break;
              case 'simposio':
                color = 'var(--simposio-color)';
                label = 'Simposio';
                break;
              case 'discusion':
                color = 'var(--keynote-color)';
                label = 'Discusión';
                break;
              default:
                color = 'var(--gray-400)';
                label = item.event_type;
            }
            return `
              <div class="donut-item">
                <span class="donut-color" style="background-color: ${color}"></span>
                <span>${label}: ${item.count}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="chart-container">
        <h3>Por Día</h3>
        <div class="bar-chart">
          ${(eventsByDay || []).map(item => {
            const maxCount = Math.max(...(eventsByDay || []).map(d => d.count));
            return `
              <div class="bar-item">
                <div class="bar" style="height: ${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%"></div>
                <span class="bar-label">${item.scheduled_day?.split(' ')[0] || 'N/A'}</span>
                <span class="bar-value">${item.count}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    
    this.elements.chartsContainer.innerHTML = chartsHTML;
  }

  renderRecentActivity() {
    if (!this.elements.chartsContainer || !this.data.analytics.recentActivity) return;

    const { recentActivity } = this.data.analytics;

    // Helper function to format dates safely
    const formatDate = (dateValue) => {
      if (!dateValue || dateValue === '0' || dateValue === 0 || dateValue === null) {
        return 'Fecha no disponible';
      }

      try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime()) || date.getFullYear() < 1970) {
          return 'Fecha no disponible';
        }
        return date.toLocaleString('es-CL', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (error) {
        return 'Fecha no disponible';
      }
    };

    const activityHTML = `
      <div class="activity-container">
        <h3>Actividad Reciente</h3>
        <div class="activity-list">
          ${(recentActivity || []).map(event => `
            <div class="activity-item">
              <div class="activity-content">
                <div class="activity-title">${event.title?.es || 'Sin título'}</div>
                <div class="activity-meta">
                  <span class="activity-status status-${event.status}">${event.status === 'publicado' ? 'Publicado' : 'Borrador'}</span>
                  <span class="activity-time">${formatDate(event.updated_at)}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    const activityContainer = document.createElement('div');
    activityContainer.innerHTML = activityHTML;
    this.elements.chartsContainer.appendChild(activityContainer.firstElementChild);
  }

  // Schedule rendering optimizado
  renderScheduleView() {
    this.batchDOMUpdate(() => {
      this.renderDrafts();
      this.renderSchedule();
      setTimeout(() => this.initializeDragAndDrop(), 100);
    });
  }

  renderDrafts() {
    if (!this.elements.draftListEl) return;

    const draftCount = document.getElementById('draft-count');
    if (draftCount) {
      draftCount.textContent = this.data.drafts.length;
    }

    const fragment = document.createDocumentFragment();

    // Añadir controles de selección múltiple si está activado el modo
    if (this.state.multiSelectMode && this.data.drafts.length > 0) {
      const controls = document.createElement('div');
      controls.className = 'multi-select-controls';
      controls.innerHTML = `
        <button class="btn-select-all" onclick="dashboard.selectAllDrafts()">
          Seleccionar Todos
        </button>
        <button class="btn-clear-selection" onclick="dashboard.clearSelection()">
          Limpiar Selección
        </button>
        <span class="selection-count">${this.state.selectedEvents.size} seleccionados</span>
      `;
      fragment.appendChild(controls);
    }

    if (this.data.drafts.length > 0) {
      this.data.drafts.forEach(event => {
        const card = this.createEventCard(event, 'full');
        fragment.appendChild(card);
      });
    } else {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = '<p>No hay eventos pendientes</p>';
      fragment.appendChild(emptyState);
    }

    this.elements.draftListEl.replaceChildren(fragment);
  }

  /**
   * Seleccionar todos los eventos en borradores
   *
   * :returns: void
   */
  selectAllDrafts() {
    this.data.drafts.forEach(event => {
      this.state.selectedEvents.add(event.id);
    });
    this.renderScheduleView();
  }

  /**
   * Limpiar la selección de eventos
   *
   * :returns: void
   */
  clearSelection() {
    this.state.selectedEvents.clear();
    this.renderScheduleView();
  }

  /**
   * Actualizar controles de selección múltiple
   *
   * :returns: void
   */
  updateMultiSelectControls() {
    const countElements = document.querySelectorAll('.selection-count');
    countElements.forEach(el => {
      el.textContent = `${this.state.selectedEvents.size} seleccionados`;
    });
  }

  /**
   * Alternar modo de selección múltiple
   *
   * :returns: void
   */
  toggleMultiSelectMode() {
    this.state.multiSelectMode = !this.state.multiSelectMode;

    // Limpiar selección al desactivar
    if (!this.state.multiSelectMode) {
      this.state.selectedEvents.clear();
    }

    // Actualizar botón
    const btn = document.getElementById('toggle-multiselect-btn');
    if (btn) {
      btn.textContent = this.state.multiSelectMode ? 'Desactivar Selección' : 'Modo Selección';
      btn.classList.toggle('active', this.state.multiSelectMode);
    }

    // Re-renderizar vista y reinicializar drag & drop
    this.renderScheduleView();

    // CRÍTICO: Reinicializar drag & drop con nueva configuración
    setTimeout(() => {
      this.initializeDragAndDrop();
    }, 150);

    this.showNotification(
      this.state.multiSelectMode
        ? 'Modo de selección múltiple activado - Marca los eventos y arrástralos'
        : 'Modo de selección múltiple desactivado',
      'info'
    );
  }

  renderSchedule() {
    if (!this.elements.gridEl || !this.elements.dayFilterEl) return;
    
    const selectedDay = this.elements.dayFilterEl.value;
    const fragment = document.createDocumentFragment();

    const daysToRender = selectedDay === 'todos' 
      ? Object.keys(this.scheduleBlocks).filter(k => k !== 'salas') 
      : [selectedDay];

    daysToRender.forEach(day => {
      const dayBlock = this.createDayBlock(day);
      fragment.appendChild(dayBlock);
    });

    this.elements.gridEl.replaceChildren(fragment);
    
    setTimeout(() => this.updateSlotVisuals(), 100);
  }

  createDayBlock(day) {
    const dayBlock = document.createElement('div');
    dayBlock.className = 'day-block';
    dayBlock.innerHTML = `<h2>${day}</h2>`;

    const timeBlocks = this.scheduleBlocks[day];
    const timeBlocksFragment = document.createDocumentFragment();

    timeBlocks.forEach(time => {
      const timeBlock = this.createTimeBlock(day, time);
      timeBlocksFragment.appendChild(timeBlock);
    });

    dayBlock.appendChild(timeBlocksFragment);
    return dayBlock;
  }

  createTimeBlock(day, time) {
    const timeBlock = document.createElement('div');
    timeBlock.className = 'time-block';
    timeBlock.innerHTML = `<h3>${time}</h3>`;
    
    const roomsContainer = document.createElement('div');
    roomsContainer.className = 'rooms-container';
    
    const roomsFragment = document.createDocumentFragment();

    for (let roomNum = 1; roomNum <= this.scheduleBlocks.salas; roomNum++) {
      const roomSlot = this.createRoomSlot(day, time, roomNum);
      roomsFragment.appendChild(roomSlot);
    }
    
    roomsContainer.appendChild(roomsFragment);
    timeBlock.appendChild(roomsContainer);
    
    return timeBlock;
  }

  createRoomSlot(day, time, roomNum) {
    const roomSlot = document.createElement('div');
    roomSlot.className = 'room-slot';
    roomSlot.dataset.day = day;
    roomSlot.dataset.time = time;
    roomSlot.dataset.room = roomNum;
    roomSlot.setAttribute('data-room-label', `Room ${roomNum}`);

    const eventsInSlot = this.data.published
      .filter(e => 
        e.scheduled_day === day && 
        e.scheduled_time_block === time && 
        e.room == roomNum
      )
      .sort((a, b) => (a.turn_order || 0) - (b.turn_order || 0));

    const eventsFragment = document.createDocumentFragment();
    eventsInSlot.forEach(event => {
      const card = this.createEventCard(event, 'mini');
      eventsFragment.appendChild(card);
    });
    
    roomSlot.appendChild(eventsFragment);

    // Añadir botón de acciones si hay eventos en el slot
    if (eventsInSlot.length > 0) {
      const actionsBtn = document.createElement('button');
      actionsBtn.className = 'slot-actions-btn';
      actionsBtn.innerHTML = '•••';
      actionsBtn.setAttribute('data-tooltip', 'Mover mesa completa');
      actionsBtn.onclick = (e) => {
        e.stopPropagation();
        this.showMoveSlotModal(day, time, roomNum, eventsInSlot.length);
      };
      roomSlot.appendChild(actionsBtn);
    }

    return roomSlot;
  }

  updateSlotVisuals() {
    const roomSlots = document.querySelectorAll('.room-slot');
    
    requestAnimationFrame(() => {
      roomSlots.forEach(slot => {
        const eventCount = slot.querySelectorAll('.event-card').length;
        const maxCapacity = 6;
        
        slot.classList.remove('is-full', 'is-overloaded');
        const existingIndicator = slot.querySelector('.capacity-indicator');
        existingIndicator?.remove();
        
        if (eventCount === 0) return;
        
        let indicatorClass = '';
        const indicatorText = `${eventCount}/${maxCapacity}`;
        
        if (eventCount === maxCapacity) {
          slot.classList.add('is-full');
          indicatorClass = 'full';
        } else if (eventCount > maxCapacity) {
          slot.classList.add('is-overloaded');
          indicatorClass = 'overloaded';
        }
        
        const indicator = document.createElement('div');
        indicator.className = `capacity-indicator ${indicatorClass}`;
        indicator.textContent = indicatorText;
        slot.style.position = 'relative';
        slot.appendChild(indicator);
      });
    });
  }
    extractEjeNumber(event) {
      if (event.eje && event.eje.es && typeof event.eje.es === 'string') {
        const match = event.eje.es.match(/EJE\s*(\d+)/i);
        if (match) return match[1];
      }
      
      if (event.mesa_title && event.mesa_title.es && typeof event.mesa_title.es === 'string') {
        const match = event.mesa_title.es.match(/EJE\s*(\d+)/i);
        if (match) return match[1];
      }
      
      if (event.title && event.title.es && typeof event.title.es === 'string') {
        const match = event.title.es.match(/EJE\s*(\d+)/i);
        if (match) return match[1];
      }
      
      return null;
    }
  createEventCard(event, type) {
    const title = event.title?.es || 'Sin Título';
    const authors = event.authors?.es || 'Sin Autores';
    const typeClass = event.event_type === 'simposio' ? 'simposio' : '';

    const card = document.createElement('div');
    card.dataset.id = event.id;
    card.className = `event-card ${typeClass}`;

    // Añadir clase si está seleccionada
    if (this.state.selectedEvents.has(event.id)) {
      card.classList.add('selected');
    }

    if (type === 'mini') {
      card.classList.add('event-card-mini');
      card.setAttribute('data-tooltip', `${title}\n${authors}`);

      const ejeNumber = this.extractEjeNumber(event);

      card.innerHTML = `
        ${this.state.multiSelectMode ? `
          <label class="event-checkbox" onclick="event.stopPropagation()">
            <input type="checkbox" ${this.state.selectedEvents.has(event.id) ? 'checked' : ''}>
          </label>
        ` : ''}
        <div class="event-id">${event.id}</div>
        ${ejeNumber ? `<div class="event-eje">Eje ${ejeNumber}</div>` : ''}
        ${event.turn_order !== null ? `<div class="turn-order">#${event.turn_order + 1}</div>` : ''}
      `;
    } else {
      card.innerHTML = `
        ${this.state.multiSelectMode ? `
          <label class="event-checkbox" onclick="event.stopPropagation()">
            <input type="checkbox" ${this.state.selectedEvents.has(event.id) ? 'checked' : ''}>
          </label>
        ` : ''}
        <div class="event-header">
          <strong>${title}</strong>
          <span class="event-id-badge">${event.id}</span>
        </div>
        <p class="event-authors">${authors}</p>
        <div class="event-meta">
          <span class="event-type">${event.event_type}</span>
        </div>
      `;
    }

    // Event listener para el checkbox
    if (this.state.multiSelectMode) {
      const checkbox = card.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          e.stopPropagation();
          this.toggleEventCardSelection(event.id);
        });
      }
    }

    return card;
  }

  toggleEventCardSelection(eventId) {
    if (this.state.selectedEvents.has(eventId)) {
      this.state.selectedEvents.delete(eventId);
    } else {
      this.state.selectedEvents.add(eventId);
    }

    // Actualizar UI de la tarjeta
    const cards = document.querySelectorAll(`[data-id="${eventId}"]`);
    cards.forEach(card => {
      const checkbox = card.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = this.state.selectedEvents.has(eventId);
      }
      card.classList.toggle('selected', this.state.selectedEvents.has(eventId));
    });

    console.log('📋 Eventos seleccionados:', Array.from(this.state.selectedEvents));
    this.updateMultiSelectControls();
  }

  /**
   * Inicializar sistema de arrastrar y soltar optimizado
   * Soporta arrastrar múltiples elementos cuando el modo de selección está activo
   *
   * :returns: void
   */
  initializeDragAndDrop() {
    this.sortableInstances.forEach(instance => instance?.destroy?.());
    this.sortableInstances = [];

    const containers = [
      this.elements.draftListEl,
      ...document.querySelectorAll('.room-slot')
    ].filter(Boolean);

    // Sistema de arrastre múltiple manual (más confiable que el plugin)
    console.log('Sistema de arrastre múltiple manual activado');

    const sortableConfig = {
      group: 'shared',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      forceFallback: false,
      // NO usar multiDrag nativo - implementación manual más robusta
      // multiDrag: true,
      // selectedClass: 'selected',
      // multiDragKey: null,

      /**
       * Evento al iniciar el arrastre
       */
      onStart: (evt) => {
        this.state.isDragging = true;
        document.body.classList.add('dragging-active');

        // Guardar IDs seleccionados para arrastre múltiple manual
        const draggedId = evt.item.dataset.id;

        console.log('🎯 DEBUG onStart:');
        console.log('  - multiSelectMode:', this.state.multiSelectMode);
        console.log('  - selectedEvents.size:', this.state.selectedEvents.size);
        console.log('  - selectedEvents:', Array.from(this.state.selectedEvents));
        console.log('  - draggedId:', draggedId);
        console.log('  - está en selección?:', this.state.selectedEvents.has(draggedId));

        if (this.state.multiSelectMode && this.state.selectedEvents.size > 0 && this.state.selectedEvents.has(draggedId)) {
          // Almacenar todos los IDs seleccionados para moverlos después
          this.draggedEventIds = Array.from(this.state.selectedEvents);

          // Añadir clase visual a todos los elementos seleccionados
          this.draggedEventIds.forEach(id => {
            const cards = document.querySelectorAll(`[data-id="${id}"]`);
            cards.forEach(card => card.classList.add('dragging-multi'));
          });

          console.log(`🔄 Arrastrando ${this.draggedEventIds.length} eventos:`, this.draggedEventIds);
        } else {
          // Solo arrastrar el elemento actual
          this.draggedEventIds = [draggedId];
          console.log('🔄 Arrastrando 1 evento:', draggedId);
        }
      },

      /**
       * Validación durante el movimiento
       */
      onMove: (evt) => {
        const targetContainer = evt.to;
        const maxCapacity = 6;

        if (targetContainer.classList.contains('room-slot')) {
          const currentCount = targetContainer.querySelectorAll('.event-card').length;
          const movingCount = this.draggedEventIds ? this.draggedEventIds.length : 1;

          // Validar capacidad considerando múltiples elementos
          if (currentCount + movingCount > maxCapacity) {
            targetContainer.classList.add('drop-invalid');
            return false;
          } else {
            targetContainer.classList.remove('drop-invalid');
          }
        }
        return true;
      },

      /**
       * Evento al finalizar el arrastre
       */
      onEnd: (evt) => {
        this.state.isDragging = false;
        document.body.classList.remove('dragging-active');

        // Limpiar estilos de feedback
        document.querySelectorAll('.drop-invalid, .dragging-multi').forEach(el => {
          el.classList.remove('drop-invalid', 'dragging-multi');
        });

        // Actualizar con throttling
        this.throttledHandleDrop(evt);
      },
    };

    containers.forEach(container => {
      if (container && typeof Sortable !== 'undefined') {
        try {
          const sortableInstance = new Sortable(container, sortableConfig);
          this.sortableInstances.push(sortableInstance);
          console.log('Sortable inicializado en:', container.className);
        } catch (error) {
          console.error('Error inicializando Sortable:', error);
        }
      }
    });
  }

  // Throttling para evitar múltiples llamadas durante el drag
  throttledHandleDrop = this.throttle((evt) => {
    requestAnimationFrame(() => {
      this.handleDrop(evt);
      setTimeout(() => this.updateSlotVisuals(), 200);
    });
  }, 300);

  throttle(func, delay) {
    let lastCall = 0;
    return (...args) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        return func.apply(this, args);
      }
    };
  }

  /**
   * Manejar el drop de uno o múltiples eventos
   *
   * :param evt: Evento de SortableJS
   * :type evt: Object
   * :returns: Promise<void>
   */
  async handleDrop(evt) {
    const { item, items, from, to, newDraggableIndex } = evt;

    // Usar los IDs guardados durante onStart
    let eventsToMove = this.draggedEventIds || [item.dataset.id];

    // Filtrar IDs vacíos o inválidos
    eventsToMove = eventsToMove.filter(Boolean);

    console.log('🎯 DEBUG handleDrop:');
    console.log('  - draggedEventIds:', this.draggedEventIds);
    console.log('  - eventsToMove:', eventsToMove);
    console.log('  - Cantidad a mover:', eventsToMove.length);

    if (eventsToMove.length === 0) {
      this.draggedEventIds = null;
      return;
    }

    this.state.loading = true;

    try {
      // Mover todos los eventos seleccionados
      const movePromises = eventsToMove.map((eventId, index) => {
        const targetIndex = newDraggableIndex + index;
        return this.updateEventPosition(eventId, to, targetIndex, false);
      });

      await Promise.all(movePromises);

      // Actualizar turn orders
      const updatePromises = [];

      if (from !== to && from.classList.contains('room-slot')) {
        updatePromises.push(this.updateTurnOrdersForContainer(from));
      }

      if (to.classList.contains('room-slot')) {
        updatePromises.push(this.updateTurnOrdersForContainer(to));
      }

      await Promise.all(updatePromises);

      // Limpiar selección después del movimiento exitoso
      if (this.state.multiSelectMode) {
        this.state.selectedEvents.clear();
      }

      // Limpiar IDs arrastrados
      this.draggedEventIds = null;

      await this.reloadData(['events']);
      this.renderScheduleView();

      const message = eventsToMove.length > 1
        ? `${eventsToMove.length} eventos movidos exitosamente`
        : 'Programación actualizada';

      this.throttledShowNotification(message, 'success');

    } catch (error) {
      this.handleError('Error actualizando programación', error, false);
      this.draggedEventIds = null;
      await this.reloadData(['events']);
      this.renderScheduleView();
    } finally {
      this.state.loading = false;
    }
  }

  async updateTurnOrdersForContainer(container) {
    if (!container?.classList.contains('room-slot')) return;
    
    const cards = Array.from(container.querySelectorAll('.event-card'));
    const updatePromises = cards.map((card, index) => 
      this.updateEventPosition(card.dataset.id, container, index, false)
    );
    
    await Promise.all(updatePromises);
  }

  // Modal y gestión de eventos
  showEventDetails(eventId) {
    const event = [...this.data.drafts, ...this.data.published].find(e => e.id === eventId);
    if (!event) {
      this.showNotification('Error: No se pudo encontrar el evento.', 'error');
      return;
    }

    const title = event.title?.es || 'Sin Título';
    const authors = event.authors?.es || 'Sin Autores';

    const modalContent = `
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="close-btn" type="button">&times;</button>
      </div>
      
      <form id="edit-event-form" class="modal-body">
        <div class="detail-grid">
          <div class="detail-item full-width">
            <label for="edit-title">Editar Título</label>
            <input type="text" id="edit-title" class="form-input" value="${title}" required>
          </div>
          <div class="detail-item full-width">
            <label for="edit-authors">Editar Autores</label>
            <textarea id="edit-authors" class="form-textarea" rows="4" required>${authors}</textarea>
          </div>
          
          <hr class="full-width">
          
          ${this.renderEventReadOnlyFields(event)}
        </div>
        
        <div class="modal-footer">
          <button type="button" class="btn btn-danger" onclick="dashboard.handleDelete('${event.id}')">
            Eliminar Evento
          </button>
          <button type="submit" class="btn btn-primary">
            Guardar Cambios
          </button>
        </div>
      </form>
    `;

    if (this.elements.eventModalContent) {
      this.elements.eventModalContent.innerHTML = modalContent;
      this.elements.eventModal.classList.add('active');

      const form = document.getElementById('edit-event-form');
      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleUpdate(eventId);
      });
    }
  }

  renderEventReadOnlyFields(event) {
    return `
      <div class="detail-item">
        <label>Event ID</label>
        <span>${event.id}</span>
      </div>
      <div class="detail-item">
        <label>Tipo</label>
        <span class="badge badge-${event.event_type}">${event.event_type}</span>
      </div>
      <div class="detail-item">
        <label>Estado</label>
        <span class="badge badge-${event.status}">${event.status}</span>
      </div>
      
      ${event.scheduled_day ? `
        <div class="detail-item">
          <label>Día Programado</label>
          <span>${event.scheduled_day}</span>
        </div>
        <div class="detail-item">
          <label>Bloque Horario</label>
          <span>${event.scheduled_time_block || 'No asignado'}</span>
        </div>
        <div class="detail-item">
          <label>Sala</label>
          <span>${event.room || 'No asignada'}</span>
        </div>
        <div class="detail-item">
          <label>Turno</label>
          <span>${event.turn_order !== null ? `#${event.turn_order + 1}` : 'No definido'}</span>
        </div>
      ` : `
        <div class="detail-item full-width">
          <div class="alert alert-info">
            Este evento está en borrador y aún no ha sido programado.
          </div>
        </div>
      `}
    `;
  }

  async handleUpdate(eventId) {
    const form = document.getElementById('edit-event-form');
    if (!form || !this.validateForm(form)) return;

    this.state.loading = true;
    
    const updatedData = {
      title: { es: document.getElementById('edit-title').value.trim() },
      authors: { es: document.getElementById('edit-authors').value.trim() },
    };

    try {
      await this.updateEventAPI(eventId, updatedData);
      this.showNotification('Evento actualizado con éxito', 'success');
      this.closeEventModal();
      
      await this.reloadData(['events', 'analytics']);
      this.renderCurrentView();
      
    } catch (error) {
      this.showNotification(`Error al actualizar: ${error.message}`, 'error');
    } finally {
      this.state.loading = false;
    }
  }

  async handleDelete(eventId) {
    if (!this.confirmDelete(eventId)) return;

    this.state.loading = true;
    
    try {
      const response = await fetch('/api/admin/event-manager', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({ eventId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error en eliminación');
      }
      
      this.showNotification('Evento eliminado con éxito', 'success');
      this.closeEventModal();
      
      this.invalidateCache(['events', 'analytics']);
      await this.reloadData(['events', 'analytics']);
      this.renderCurrentView();
      
    } catch (error) {
      this.showNotification(`Error al eliminar: ${error.message}`, 'error');
    } finally {
      this.state.loading = false;
    }
  }

  validateForm(form) {
    if (!form) {
      console.error('Form not found');
      return false;
    }
    
    const title = form.querySelector('#edit-title');
    const authors = form.querySelector('#edit-authors');
    
    if (!title || !title.value.trim()) {
      this.showNotification('El título es requerido', 'warning');
      title?.focus();
      return false;
    }
    
    if (!authors || !authors.value.trim()) {
      this.showNotification('Los autores son requeridos', 'warning');
      authors?.focus();
      return false;
    }
    
    return true;
  }

  confirmDelete(eventId) {
    return confirm(
      `¿Estás seguro de que quieres eliminar el evento ${eventId}?\n\n` +
      'Esta acción es irreversible y eliminará permanentemente:\n' +
      '• El evento y toda su información\n' +
      '• Su posición en la programación\n' +
      '• Todos los datos asociados\n\n' +
      '¿Continuar con la eliminación?'
    );
  }

  closeEventModal() {
    if (this.elements.eventModal) {
      this.elements.eventModal.classList.remove('active');
    }
    
    const form = document.getElementById('edit-event-form');
    if (form) {
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);
    }
  }

  // Búsqueda optimizada con caché y normalización
  async performSearch() {
    if (this.searchController) {
      this.searchController.abort();
    }

    this.searchController = new AbortController();

    try {
      const searchParams = new URLSearchParams();
      Object.entries(this.state.filters).forEach(([key, value]) => {
        if (value && value !== 'all') {
          searchParams.append(key === 'search' ? 'q' : key, value);
        }
      });

      const cacheKey = searchParams.toString();

      // Verificar cache primero
      const cached = this.cache.get(`search:${cacheKey}`);
      if (cached && Date.now() - cached.timestamp < 10000) { // 10 segundos de cache
        this.data.searchResults = cached.data;
        requestAnimationFrame(() => this.renderSearchResults());
        return;
      }

      const response = await fetch(`/api/admin/search?${searchParams}`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` },
        signal: this.searchController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.data.searchResults = data.results || [];

      // Guardar en cache
      this.cache.set(`search:${cacheKey}`, {
        data: this.data.searchResults,
        timestamp: Date.now()
      });

      // Renderizar resultados
      requestAnimationFrame(() => {
        this.renderSearchResults();
      });

    } catch (error) {
      if (error.name !== 'AbortError') {
        this.handleError('Search error', error, false);
        this.data.searchResults = [];
        this.renderSearchResults();
      }
    }
  }

  renderSearchView() {
    const filters = [
      { name: 'status', options: [
        { value: 'all', label: 'Todos los Estados' },
        { value: 'borrador', label: 'Borrador' },
        { value: 'publicado', label: 'Publicado' }
      ]},
      { name: 'event_type', options: [
        { value: 'all', label: 'Todos los Tipos' },
        { value: 'ponencia', label: 'Ponencia' },
        { value: 'simposio', label: 'Simposio' }
      ]},
      { name: 'scheduled_day', options: [
        { value: 'all', label: 'Todos los Días' },
        ...Object.keys(this.scheduleBlocks)
          .filter(k => k !== 'salas')
          .map(day => ({ value: day, label: day }))
      ]}
    ];

    filters.forEach(({ name, options }) => {
      const filterEl = this.elements.searchFilters?.querySelector(`[name="${name}"]`);
      if (filterEl) {
        filterEl.innerHTML = options
          .map(opt => `<option value="${opt.value}">${opt.label}</option>`)
          .join('');
      }
    });

    const bulkOperationSelect = document.getElementById('bulk-operation');
    if (bulkOperationSelect) {
      bulkOperationSelect.innerHTML = `
        <option value="">Seleccionar operación...</option>
        <optgroup label="Cambios de Estado">
          <option value="move_to_draft">Mover a Borrador</option>
          <option value="publish_events">Publicar Eventos</option>
        </optgroup>
        <optgroup label="Modificaciones">
          <option value="update_type">Cambiar Tipo de Evento</option>
          <option value="assign_day">Asignar Día</option>
        </optgroup>
        <optgroup label="Limpiar/Eliminar">
          <option value="clear_schedule">Limpiar Programación</option>
          <option value="delete_events">Eliminar Eventos</option>
        </optgroup>
      `;
    }
  }

  renderSearchResults() {
    if (!this.elements.searchResults) return;

    const results = this.data.searchResults;
    const resultsCount = results.length;
    
    const headerHTML = `
      <div class="search-results-header">
        <span>${resultsCount} resultados</span>
        ${this.state.bulkMode ? `<span>${this.state.selectedEvents.size} seleccionados</span>` : ''}
      </div>
    `;

    let listHTML;
    if (resultsCount === 0) {
      listHTML = '<div class="empty-state"><p>No se encontraron resultados</p></div>';
    } else if (resultsCount > 100) {
      listHTML = this.renderVirtualizedResults(results);
    } else {
      listHTML = `<div class="search-results-list">
        ${results.map(event => this.createSearchResultCardHTML(event)).join('')}
      </div>`;
    }

    this.elements.searchResults.innerHTML = headerHTML + listHTML;
  }

  renderVirtualizedResults(results) {
    return `<div class="search-results-list">
      ${results.slice(0, 100).map(event => this.createSearchResultCardHTML(event)).join('')}
      ${results.length > 100 ? '<div class="load-more">Mostrando los primeros 100 resultados...</div>' : ''}
    </div>`;
  }

  createSearchResultCardHTML(event) {
    const title = event.title?.es || 'Sin Título';
    const authors = event.authors?.es || 'Sin Autores';
    const typeClass = event.event_type === 'simposio' ? 'simposio' : '';

    return `
      <div class="search-result-card ${typeClass}" data-id="${event.id}">
        ${this.state.bulkMode ? `
          <label class="checkbox-container">
            <input type="checkbox" ${this.state.selectedEvents.has(event.id) ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
        ` : ''}
        
        <div class="result-content">
          <div class="result-header">
            <strong>${title}</strong>
            <div class="result-badges">
              <span class="badge badge-${event.status}">${event.status}</span>
              <span class="badge badge-${event.event_type}">${event.event_type}</span>
              <span class="badge badge-id">${event.id}</span>
            </div>
          </div>
          <p class="result-authors">${authors}</p>
          ${event.scheduled_day ? `
            <div class="result-schedule">
              ${event.scheduled_day} | ${event.scheduled_time_block || 'TBD'} | Sala ${event.room || 'TBD'}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  toggleBulkMode() {
    this.state.bulkMode = !this.state.bulkMode;
    this.state.selectedEvents.clear();
    
    if (this.elements.bulkModeBtn) {
      this.elements.bulkModeBtn.textContent = this.state.bulkMode ? 'Salir de Modo Lote' : 'Modo Lote';
    }
    
    this.elements.bulkActionsBar?.classList.toggle('active', this.state.bulkMode);
    this.renderSearchResults();
  }

  toggleEventSelection(eventId) {
    if (this.state.selectedEvents.has(eventId)) {
      this.state.selectedEvents.delete(eventId);
    } else {
      this.state.selectedEvents.add(eventId);
    }
    
    this.updateBulkActionsState();
    const checkbox = document.querySelector(
      `.search-result-card[data-id="${eventId}"] input[type="checkbox"]`
    );
    if (checkbox) {
      checkbox.checked = this.state.selectedEvents.has(eventId);
    }
  }

  toggleSelectAll() {
    const isAllSelected = this.state.selectedEvents.size === this.data.searchResults.length;
    
    if (isAllSelected) {
      this.state.selectedEvents.clear();
    } else {
      this.data.searchResults.forEach(event => {
        this.state.selectedEvents.add(event.id);
      });
    }
    
    this.renderSearchResults();
    this.updateBulkActionsState();
  }

  updateBulkActionsState() {
    const hasSelection = this.state.selectedEvents.size > 0;
    
    if (this.elements.applyBulkBtn) {
      this.elements.applyBulkBtn.disabled = !hasSelection;
    }
    
    if (this.elements.selectAllBtn) {
      const isAllSelected = this.state.selectedEvents.size === this.data.searchResults.length;
      this.elements.selectAllBtn.textContent = isAllSelected ? 'Deseleccionar Todo' : 'Seleccionar Todo';
    }
  }

  async applyBulkOperation() {
    const operation = this.elements.bulkOperationSelect?.value;
    const eventIds = Array.from(this.state.selectedEvents);
    
    if (!operation || eventIds.length === 0) {
      this.showNotification('Por favor selecciona una operación y eventos', 'warning');
      return;
    }

    if (['delete_events', 'clear_schedule'].includes(operation)) {
      const confirmed = confirm(
        `¿Estás seguro de que quieres ${operation.replace('_', ' ')} ${eventIds.length} eventos?\n` +
        'Esta acción no se puede deshacer.'
      );
      if (!confirmed) return;
    }

    this.state.loading = true;
    
    try {
      const response = await fetch('/api/admin/bulk-operations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          operation,
          eventIds,
          data: {}
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      this.showNotification(`${result.message} (${result.affected} eventos afectados)`, 'success');
      
      this.state.selectedEvents.clear();
      this.invalidateCache(['events', 'analytics']);
      
      await this.reloadData(['events', 'analytics']);
      this.debouncedSearch();
      
      if (this.state.currentView === 'schedule') {
        this.renderScheduleView();
      }

    } catch (error) {
      this.handleError('Bulk operation failed', error);
    } finally {
      this.state.loading = false;
      this.updateBulkActionsState();
    }
  }

  // Data management
  async reloadData(types = ['events', 'analytics']) {
    const promises = [];
    
    if (types.includes('events')) {
      promises.push(this.loadEventsData());
    }
    
    if (types.includes('analytics')) {
      promises.push(this.loadAnalyticsData());
    }
    
    await Promise.all(promises);
  }

  async loadEventsData() {
    const data = await this.fetchWithCache('/api/admin/events');
    this.data.drafts = data.drafts || [];
    this.data.published = data.published || [];
  }

  async loadAnalyticsData() {
    this.data.analytics = await this.fetchWithCache('/api/admin/analytics');
  }

  invalidateCache(patterns = []) {
    if (patterns.length === 0) {
      this.cache.clear();
      return;
    }
    
    for (const [key] of this.cache) {
      if (patterns.some(pattern => key.includes(pattern))) {
        this.cache.delete(key);
      }
    }
  }

  // Utilities optimizadas
  showLoading(show) {
    this.elements.loadingOverlay?.classList.toggle('active', show);
    document.body.style.cursor = show ? 'wait' : '';
  }

  // Sistema de notificaciones con throttling
  throttledShowNotification = this.throttle((message, type = 'info') => {
    this.showNotification(message, type);
  }, 1000);

  showNotification(message, type = 'info') {
    // Throttle notificaciones para evitar spam
    const now = Date.now();
    const key = `${message}-${type}`;
    
    if (this.notificationThrottle.has(key)) {
      const lastShown = this.notificationThrottle.get(key);
      if (now - lastShown < 2000) { // 2 segundos de throttling
        return;
      }
    }
    
    this.notificationThrottle.set(key, now);
    
    let notification = this.elementPool.notifications.pop();
    
    if (!notification) {
      notification = document.createElement('div');
    }
    
    notification.className = `notification ${type}`;
    notification.innerHTML = `<span class="notification-message">${message}</span>`;
    
    document.body.appendChild(notification);
    
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
          this.returnToPool('notifications', notification);
        }
      }, 300);
    }, 4000);
  }

  getPooledElement(type, template) {
    const pool = this.elementPool[type];
    let element = pool.pop();
    
    if (!element) {
      element = document.createElement('div');
    }
    
    element.innerHTML = template;
    return element.firstElementChild || element;
  }

  returnToPool(type, element) {
    if (this.elementPool[type].length < 20) {
      element.innerHTML = '';
      element.className = '';
      this.elementPool[type].push(element);
    }
  }

  handleError(context, error, showNotification = true) {
    console.error(`${context}:`, error);
    
    if (showNotification) {
      const errorMessage = error.message || 'Ha ocurrido un error inesperado';
      const isDevelopment = window.location.hostname === 'localhost';
      
      this.throttledShowNotification(
        isDevelopment ? `${context}: ${errorMessage}` : 'Ha ocurrido un error. Por favor inténtalo de nuevo.',
        'error'
      );
    }
    
    if (window.gtag) {
      gtag('event', 'exception', {
        description: `${context}: ${error.message}`,
        fatal: false
      });
    }
  }

  handleAuthError() {
    sessionStorage.clear();
    this.showNotification('Sesión expirada. Redirigiendo al login...', 'warning');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 2000);
  }

  cleanup() {
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    
    if (this.searchController) {
      this.searchController.abort();
    }
    
    this.sortableInstances.forEach(instance => instance?.destroy?.());
    
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
    
    this.cache.clear();
    
    console.log('Dashboard cleanup completed');
  }

  // Modal para mover mesa completa
  showMoveSlotModal(sourceDay, sourceTime, sourceRoom, eventCount) {
    const modalHTML = `
      <div class="modal-overlay" id="move-slot-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Mover Mesa Completa</h3>
            <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>
          <div class="modal-body">
            <div class="move-slot-info">
              <p><strong>Origen:</strong> ${sourceDay} - ${sourceTime} - Sala ${sourceRoom}</p>
              <p><strong>Eventos:</strong> ${eventCount} ponencias</p>
            </div>
            <div class="form-group">
              <label for="destination-day">Día de destino:</label>
              <select id="destination-day" class="form-select">
                <option value="">Seleccionar día...</option>
                ${Object.keys(this.scheduleBlocks).filter(k => k !== 'salas').map(day =>
                  `<option value="${day}">${day}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="destination-time">Horario de destino:</label>
              <select id="destination-time" class="form-select" disabled>
                <option value="">Primero selecciona un día</option>
              </select>
            </div>
            <div class="form-group">
              <label for="destination-room">Sala de destino:</label>
              <select id="destination-room" class="form-select" disabled>
                <option value="">Selecciona día y horario primero</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
            <button class="btn btn-primary" onclick="dashboard.executeMoveSlot('${sourceDay}', '${sourceTime}', ${sourceRoom})" disabled id="move-confirm-btn">Mover Mesa</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Setup event listeners para el modal
    const modal = document.getElementById('move-slot-modal');
    const daySelect = document.getElementById('destination-day');
    const timeSelect = document.getElementById('destination-time');
    const roomSelect = document.getElementById('destination-room');
    const confirmBtn = document.getElementById('move-confirm-btn');

    // Listener para cambios en el día
    daySelect.addEventListener('change', () => {
      const selectedDay = daySelect.value;
      timeSelect.disabled = !selectedDay;
      roomSelect.disabled = true;
      confirmBtn.disabled = true;

      if (selectedDay) {
        const timeBlocks = this.scheduleBlocks[selectedDay];
        timeSelect.innerHTML = `
          <option value="">Seleccionar horario...</option>
          ${timeBlocks.map(time => `<option value="${time}">${time}</option>`).join('')}
        `;
        roomSelect.innerHTML = '<option value="">Primero selecciona un horario</option>';
      } else {
        timeSelect.innerHTML = '<option value="">Primero selecciona un día</option>';
        roomSelect.innerHTML = '<option value="">Selecciona día y horario primero</option>';
      }
    });

    // Listener para cambios en el horario
    timeSelect.addEventListener('change', async () => {
      const selectedDay = daySelect.value;
      const selectedTime = timeSelect.value;
      roomSelect.disabled = !selectedTime;
      confirmBtn.disabled = true;

      if (selectedDay && selectedTime) {
        try {
          // Obtener salas ocupadas para este slot
          const occupiedRooms = await this.getOccupiedRooms(selectedDay, selectedTime);

          // Generar opciones de salas (1-30)
          const roomOptions = [];
          roomOptions.push('<option value="">Seleccionar sala...</option>');

          for (let roomNum = 1; roomNum <= 30; roomNum++) {
            const occupancy = occupiedRooms.get(roomNum) || 0;
            const capacity = 6;
            const available = capacity - occupancy;

            if (available > 0) {
              roomOptions.push(`<option value="${roomNum}">Sala ${roomNum} (${available} espacios disponibles)</option>`);
            } else {
              roomOptions.push(`<option value="${roomNum}" disabled>Sala ${roomNum} (llena - ${occupancy}/${capacity})</option>`);
            }
          }

          roomSelect.innerHTML = roomOptions.join('');
        } catch (error) {
          console.error('Error loading room availability:', error);
          roomSelect.innerHTML = '<option value="">Error cargando salas</option>';
        }
      } else {
        roomSelect.innerHTML = '<option value="">Primero selecciona un horario</option>';
      }
    });

    // Listener para cambios en la sala
    roomSelect.addEventListener('change', () => {
      confirmBtn.disabled = !roomSelect.value;
    });

    // Cerrar modal al hacer click fuera
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  async getOccupiedRooms(day, time) {
    try {
      // Filtar eventos publicados para el día y hora específicos
      const eventsInSlot = this.data.published.filter(event =>
        event.scheduled_day === day &&
        event.scheduled_time_block === time &&
        event.room !== null
      );

      // Contar ocupación por sala
      const occupancy = new Map();
      eventsInSlot.forEach(event => {
        const room = parseInt(event.room);
        occupancy.set(room, (occupancy.get(room) || 0) + 1);
      });

      return occupancy;
    } catch (error) {
      console.error('Error calculating room occupancy:', error);
      return new Map();
    }
  }

  async executeMoveSlot(sourceDay, sourceTime, sourceRoom) {
    const daySelect = document.getElementById('destination-day');
    const timeSelect = document.getElementById('destination-time');
    const roomSelect = document.getElementById('destination-room');

    const destinationDay = daySelect.value;
    const destinationTime = timeSelect.value;
    const destinationRoom = roomSelect.value;

    if (!destinationDay || !destinationTime || !destinationRoom) {
      this.showNotification('Por favor selecciona día, horario y sala de destino', 'warning');
      return;
    }

    if (sourceDay === destinationDay && sourceTime === destinationTime && sourceRoom == destinationRoom) {
      this.showNotification('El origen y destino no pueden ser iguales', 'warning');
      return;
    }

    this.state.loading = true;

    try {
      const response = await fetch('/api/admin/bulk-operations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          operation: 'move_slot',
          data: {
            source: {
              day: sourceDay,
              time: sourceTime,
              room: sourceRoom
            },
            destination: {
              day: destinationDay,
              time: destinationTime,
              room: destinationRoom
            }
          }
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || `HTTP error! status: ${response.status}`);
      }

      this.showNotification(
        `Mesa movida exitosamente: ${result.affected} eventos movidos de Sala ${sourceRoom} a Sala ${destinationRoom}`,
        'success'
      );

      // Cerrar modal y actualizar datos
      document.getElementById('move-slot-modal').remove();
      this.invalidateCache(['events', 'analytics']);
      await this.reloadData(['events', 'analytics']);
      this.renderScheduleView();

    } catch (error) {
      this.handleError('Error moviendo mesa', error);
    } finally {
      this.state.loading = false;
    }
  }

  // ✅ FUNCIÓN CORREGIDA handleSyncMdb
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

        // ✅ CORRECCIÓN: Usar los métodos correctos
        if (result.addedCount > 0) {
            await this.reloadData(['events', 'analytics']); // ✅ Método correcto
            this.renderCurrentView();                       // ✅ Método correcto
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
}

// Initialize dashboard con error boundary optimizado
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
  try {
    dashboard = new EnhancedCongressDashboard();
  } catch (error) {
    console.error('Failed to initialize dashboard:', error);
    
    document.body.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; gap: 20px;">
        <h1>Error al Inicializar Dashboard</h1>
        <p>Por favor actualiza la página o contacta soporte si el problema persiste.</p>
        <button onclick="window.location.reload()" style="padding: 10px 20px; background: #007cba; color: white; border: none; border-radius: 5px; cursor: pointer;">
          Actualizar Página
        </button>
      </div>
    `;
  }
});

window.addEventListener('error', (event) => {
  if (dashboard) {
    dashboard.handleError('Global Error', event.error, false);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (dashboard) {
    dashboard.handleError('Unhandled Promise Rejection', event.reason, false);
  }
});