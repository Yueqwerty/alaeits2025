class EnhancedCongressDashboard {
  constructor() {
    this.authToken = sessionStorage.getItem('authToken');
    this.isAuthenticated = sessionStorage.getItem('isAdminAuthenticated');
    
    this.data = {
      drafts: [],
      published: [],
      analytics: null,
      searchResults: []
    };
    
    this.state = {
      currentView: 'dashboard',
      selectedEvents: new Set(),
      filters: {
        search: '',
        status: 'all',
        event_type: 'all',
        scheduled_day: 'all',
        room: 'all'
      },
      bulkMode: false
    };
    
    this.sortableInstances = [];
    this.scheduleBlocks = this.getScheduleBlocks();
    
    this.cacheElements();
    this.init();
  }

  cacheElements() {
    // Navigation
    this.navItems = document.querySelectorAll('.nav-item');
    this.viewContainers = document.querySelectorAll('.view-container');
    this.logoutBtn = document.getElementById('logout-btn');
    
    // Dashboard view
    this.analyticsContainer = document.getElementById('analytics-container');
    this.metricsGrid = document.getElementById('metrics-grid');
    this.chartsContainer = document.getElementById('charts-container');
    
    // Schedule view
    this.draftListEl = document.getElementById('draft-list');
    this.gridEl = document.getElementById('schedule-grid');
    this.dayFilterEl = document.getElementById('day-filter');
    
    // Search view
    this.searchInput = document.getElementById('search-input');
    this.searchFilters = document.getElementById('search-filters');
    this.searchResults = document.getElementById('search-results');
    this.bulkActionsBar = document.getElementById('bulk-actions-bar');
    this.bulkModeBtn = document.getElementById('bulk-mode-btn');
    this.selectAllBtn = document.getElementById('select-all-btn');
    this.bulkOperationSelect = document.getElementById('bulk-operation');
    this.applyBulkBtn = document.getElementById('apply-bulk-btn');
    
    // Modals and overlays
    this.eventModal = document.getElementById('event-modal');
    this.eventModalContent = document.getElementById('event-modal-content');
    this.loadingOverlay = document.getElementById('loading-overlay');
  }

  getScheduleBlocks() {
    return {
      'martes 14 de octubre': [
        '08:30 - 10:10', 
        '10:20 - 12:00', 
        '12:10 - 13:50',
        '15:00 - 16:40', 
        '16:50 - 18:30'
      ],
      'miércoles 15 de octubre': [
        '08:30 - 10:10', 
        '10:20 - 12:00', 
        '12:10 - 13:50', 
        '14:00 - 15:30'
      ],
      'salas': 30
    };
  }

  async init() {
    if (!this.authToken || this.isAuthenticated !== 'true') {
      window.location.href = 'login.html';
      return;
    }
    
    this.setupEventListeners();
    this.showLoading(true);
    
    try {
      await Promise.all([
        this.loadData(),
        this.loadAnalytics()
      ]);
      this.switchView('dashboard');
    } catch (error) {
      this.showNotification('Error loading dashboard: ' + error.message, 'error');
    } finally {
      this.showLoading(false);
    }
  }

  setupEventListeners() {
    // Navigation
    this.navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        this.switchView(view);
      });
    });

    // Logout
    if (this.logoutBtn) {
      this.logoutBtn.addEventListener('click', () => {
        sessionStorage.clear();
        window.location.href = 'login.html';
      });
    }

    // Schedule view
    if (this.dayFilterEl) {
      this.dayFilterEl.addEventListener('change', () => this.renderSchedule());
    }

    // Search functionality
    if (this.searchInput) {
      let searchTimeout;
      this.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.state.filters.search = e.target.value;
          this.performSearch();
        }, 300);
      });
    }

    // Search filters
    if (this.searchFilters) {
      this.searchFilters.addEventListener('change', (e) => {
        if (e.target.matches('select')) {
          this.state.filters[e.target.name] = e.target.value;
          this.performSearch();
        }
      });
    }

    // Bulk operations
    if (this.bulkModeBtn) {
      this.bulkModeBtn.addEventListener('click', () => {
        this.toggleBulkMode();
      });
    }

    if (this.selectAllBtn) {
      this.selectAllBtn.addEventListener('click', () => {
        this.toggleSelectAll();
      });
    }

    if (this.applyBulkBtn) {
      this.applyBulkBtn.addEventListener('click', () => {
        this.applyBulkOperation();
      });
    }

    // Modal close
    if (this.eventModal) {
      this.eventModal.addEventListener('click', (e) => {
        if (e.target === this.eventModal) {
          this.closeEventModal();
        }
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'f':
            e.preventDefault();
            if (this.searchInput) this.searchInput.focus();
            break;
          case 'a':
            if (this.state.bulkMode) {
              e.preventDefault();
              this.toggleSelectAll();
            }
            break;
        }
      }
      
      if (e.key === 'Escape') {
        this.closeEventModal();
      }
    });
  }

  async loadData() {
    try {
      const response = await fetch('/api/admin/events', { 
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          sessionStorage.clear();
          window.location.href = 'login.html';
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      this.data.drafts = data.drafts || [];
      this.data.published = data.published || [];
    } catch (error) {
      console.error("Error loading data:", error);
      throw error;
    }
  }

  async loadAnalytics() {
    try {
      const response = await fetch('/api/admin/analytics', { 
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      this.data.analytics = await response.json();
    } catch (error) {
      console.error("Error loading analytics:", error);
      throw error;
    }
  }

  async performSearch() {
    try {
      const params = new URLSearchParams(this.state.filters);
      const response = await fetch(`/api/admin/search?${params}`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      this.data.searchResults = data.results;
      this.renderSearchResults();
    } catch (error) {
      console.error("Error performing search:", error);
      this.showNotification('Search error', 'error');
    }
  }

  switchView(viewName) {
    // Update navigation
    this.navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    // Show/hide view containers
    this.viewContainers.forEach(container => {
      container.classList.toggle('active', container.id === `${viewName}-view`);
    });

    this.state.currentView = viewName;

    // Render view-specific content
    switch (viewName) {
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'schedule':
        this.renderScheduleView();
        break;
      case 'search':
        this.renderSearchView();
        this.performSearch();
        break;
    }
  }

  renderDashboard() {
    if (!this.data.analytics) return;

    this.renderMetrics();
    this.renderCharts();
    this.renderRecentActivity();
  }

  renderMetrics() {
    const { summary } = this.data.analytics;
    
    const metricsHTML = `
      <div class="metric-card">
        <div class="metric-icon"></div>
        <div class="metric-content">
          <div class="metric-value">${summary.totalEvents}</div>
          <div class="metric-label">Total Events</div>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-icon"></div>
        <div class="metric-content">
          <div class="metric-value">${summary.totalScheduled}</div>
          <div class="metric-label">Scheduled</div>
          <div class="metric-trend">+${summary.completionRate}%</div>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-icon"></div>
        <div class="metric-content">
          <div class="metric-value">${summary.totalDrafts}</div>
          <div class="metric-label">Drafts Pending</div>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-icon"></div>
        <div class="metric-content">
          <div class="metric-value">${summary.overallUtilization}%</div>
          <div class="metric-label">Room Utilization</div>
        </div>
      </div>
    `;
    
    this.metricsGrid.innerHTML = metricsHTML;
  }

  renderCharts() {
    const { eventsByStatus, eventsByType, eventsByDay, roomUtilization } = this.data.analytics;
    
    const chartsHTML = `
      <div class="chart-container">
        <h3>Events by Status</h3>
        <div class="progress-chart">
          ${eventsByStatus.map(item => `
            <div class="progress-item">
              <span class="progress-label">${item.status}</span>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${(item.count / this.data.analytics.summary.totalEvents) * 100}%"></div>
              </div>
              <span class="progress-value">${item.count}</span>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div class="chart-container">
        <h3>Events by Type</h3>
        <div class="donut-chart">
          ${eventsByType.map((item, index) => `
            <div class="donut-item">
              <span class="donut-color" style="background-color: ${index === 0 ? 'var(--ponencia-color)' : 'var(--simposio-color)'}"></span>
              <span>${item.event_type}: ${item.count}</span>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div class="chart-container">
        <h3>Events by Day</h3>
        <div class="bar-chart">
          ${eventsByDay.map(item => `
            <div class="bar-item">
              <div class="bar" style="height: ${(item.count / Math.max(...eventsByDay.map(d => d.count))) * 100}%"></div>
              <span class="bar-label">${item.scheduled_day?.split(' ')[0] || 'N/A'}</span>
              <span class="bar-value">${item.count}</span>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div class="chart-container">
        <h3>Top Room Utilization</h3>
        <div class="list-chart">
          ${roomUtilization.slice(0, 10).map(room => `
            <div class="list-item">
              <span class="list-label">Room ${room.room}</span>
              <div class="list-bar">
                <div class="list-fill" style="width: ${room.utilization_rate}%"></div>
              </div>
              <span class="list-value">${room.utilization_rate}%</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    this.chartsContainer.innerHTML = chartsHTML;
  }

  renderRecentActivity() {
    const { recentActivity } = this.data.analytics;
    
    const activityHTML = `
      <div class="activity-container">
        <h3>Recent Activity</h3>
        <div class="activity-list">
          ${recentActivity.map(event => `
            <div class="activity-item">
              <div class="activity-icon ${event.event_type}"></div>
              <div class="activity-content">
                <div class="activity-title">${event.title?.es || 'No title'}</div>
                <div class="activity-meta">
                  <span class="activity-status status-${event.status}">${event.status}</span>
                  <span class="activity-time">${new Date(event.updated_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    const activityContainer = document.createElement('div');
    activityContainer.innerHTML = activityHTML;
    this.chartsContainer.appendChild(activityContainer.firstElementChild);
  }

  renderScheduleView() {
    this.renderDrafts();
    this.renderSchedule();
    this.initializeDragAndDrop();
  }

  renderDrafts() {
    if (!this.draftListEl) return;
    
    const draftCount = document.getElementById('draft-count');
    if (draftCount) {
      draftCount.textContent = this.data.drafts.length;
    }
    
    this.draftListEl.innerHTML = this.data.drafts.length > 0
      ? this.data.drafts.map(e => this.createEventCard(e, 'full')).join('')
      : '<div class="empty-state"><p>No pending events</p></div>';
  }

  renderSchedule() {
    if (!this.gridEl || !this.dayFilterEl) return;
    
    const selectedDay = this.dayFilterEl.value;
    this.gridEl.innerHTML = '';

    const daysToRender = selectedDay === 'todos' 
      ? Object.keys(this.scheduleBlocks).filter(k => k !== 'salas') 
      : [selectedDay];

    daysToRender.forEach(day => {
      const dayBlock = document.createElement('div');
      dayBlock.className = 'day-block';
      dayBlock.innerHTML = `<h2>${day}</h2>`;

      this.scheduleBlocks[day].forEach(time => {
        const timeBlock = document.createElement('div');
        timeBlock.className = 'time-block';
        timeBlock.innerHTML = `<h3>${time}</h3>`;
        
        const roomsContainer = document.createElement('div');
        roomsContainer.className = 'rooms-container';

        for (let roomNum = 1; roomNum <= this.scheduleBlocks.salas; roomNum++) {
          const roomSlot = document.createElement('div');
          roomSlot.className = 'room-slot';
          roomSlot.dataset.day = day;
          roomSlot.dataset.time = time;
          roomSlot.dataset.room = roomNum;
          roomSlot.setAttribute('data-room-label', `Room ${roomNum}`);

          const eventsInSlot = this.data.published.filter(e => 
            e.scheduled_day === day && 
            e.scheduled_time_block === time && 
            e.room == roomNum
          ).sort((a, b) => (a.turn_order || 0) - (b.turn_order || 0));

          roomSlot.innerHTML = eventsInSlot.map(e => this.createEventCard(e, 'mini')).join('');
          roomsContainer.appendChild(roomSlot);
        }
        timeBlock.appendChild(roomsContainer);
        dayBlock.appendChild(timeBlock);
      });
      this.gridEl.appendChild(dayBlock);
    });
  }

  renderSearchView() {
    // Populate filter options
    const statusFilter = this.searchFilters?.querySelector('[name="status"]');
    const typeFilter = this.searchFilters?.querySelector('[name="event_type"]');
    const dayFilter = this.searchFilters?.querySelector('[name="scheduled_day"]');

    if (statusFilter) {
      statusFilter.innerHTML = `
        <option value="all">All Statuses</option>
        <option value="borrador">Draft</option>
        <option value="publicado">Published</option>
      `;
    }

    if (typeFilter) {
      typeFilter.innerHTML = `
        <option value="all">All Types</option>
        <option value="ponencia">Presentation</option>
        <option value="simposio">Symposium</option>
      `;
    }

    if (dayFilter) {
      dayFilter.innerHTML = `
        <option value="all">All Days</option>
        ${Object.keys(this.scheduleBlocks).filter(k => k !== 'salas').map(day => 
          `<option value="${day}">${day}</option>`
        ).join('')}
      `;
    }
  }

  renderSearchResults() {
    if (!this.searchResults) return;

    const resultsHTML = this.data.searchResults.length > 0 
      ? this.data.searchResults.map(event => this.createSearchResultCard(event)).join('')
      : '<div class="empty-state"><p>No results found</p></div>';

    this.searchResults.innerHTML = `
      <div class="search-results-header">
        <span>${this.data.searchResults.length} results</span>
        ${this.state.bulkMode ? `<span>${this.state.selectedEvents.size} selected</span>` : ''}
      </div>
      <div class="search-results-list">${resultsHTML}</div>
    `;
  }

  createEventCard(event, type) {
    const title = event.title?.es || 'No Title';
    const authors = event.authors?.es || 'No Authors';
    const typeClass = event.event_type === 'simposio' ? 'simposio' : '';

    if (type === 'mini') {
      return `<div class="event-card event-card-mini ${typeClass}" data-id="${event.id}" data-tooltip="${title}\n${authors}" onclick="dashboard.showEventDetails('${event.id}')">
          <div class="event-id">${event.id}</div>
          ${event.turn_order !== null ? `<div class="turn-order">#${event.turn_order + 1}</div>` : ''}
      </div>`;
    } else {
      return `<div class="event-card ${typeClass}" data-id="${event.id}" onclick="dashboard.showEventDetails('${event.id}')">
          <div class="event-header">
            <strong>${title}</strong>
            <span class="event-id-badge">${event.id}</span>
          </div>
          <p class="event-authors">${authors}</p>
          <div class="event-meta">
            <span class="event-type">${event.event_type}</span>
          </div>
      </div>`;
    }
  }

  createSearchResultCard(event) {
    const title = event.title?.es || 'No Title';
    const authors = event.authors?.es || 'No Authors';
    const typeClass = event.event_type === 'simposio' ? 'simposio' : '';

    return `<div class="search-result-card ${typeClass}" data-id="${event.id}">
        ${this.state.bulkMode ? `
          <label class="checkbox-container">
            <input type="checkbox" ${this.state.selectedEvents.has(event.id) ? 'checked' : ''} onchange="dashboard.toggleEventSelection('${event.id}')">
            <span class="checkmark"></span>
          </label>
        ` : ''}
        
        <div class="result-content" onclick="dashboard.showEventDetails('${event.id}')">
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
              ${event.scheduled_day} | ${event.scheduled_time_block || 'TBD'} | Room ${event.room || 'TBD'}
            </div>
          ` : ''}
        </div>
    </div>`;
  }

  showEventDetails(eventId) {
    const event = [...this.data.drafts, ...this.data.published].find(e => e.id === eventId);
    if (!event) return;

    const title = event.title?.es || 'No Title';
    const authors = event.authors?.es || 'No Authors';

    const modalContent = `
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="close-btn" onclick="dashboard.closeEventModal()">&times;</button>
      </div>
      
      <div class="modal-body">
        <div class="detail-grid">
          <div class="detail-item">
            <label>Event ID</label>
            <span>${event.id}</span>
          </div>
          
          <div class="detail-item">
            <label>Type</label>
            <span class="badge badge-${event.event_type}">${event.event_type}</span>
          </div>
          
          <div class="detail-item">
            <label>Status</label>
            <span class="badge badge-${event.status}">${event.status}</span>
          </div>
          
          <div class="detail-item full-width">
            <label>Title</label>
            <p>${title}</p>
          </div>
          
          <div class="detail-item full-width">
            <label>Authors</label>
            <p>${authors}</p>
          </div>
          
          ${event.scheduled_day ? `
            <div class="detail-item">
              <label>Scheduled Day</label>
              <span>${event.scheduled_day}</span>
            </div>
            
            <div class="detail-item">
              <label>Time Block</label>
              <span>${event.scheduled_time_block || 'Not assigned'}</span>
            </div>
            
            <div class="detail-item">
              <label>Room</label>
              <span>${event.room || 'Not assigned'}</span>
            </div>
            
            <div class="detail-item">
              <label>Turn Order</label>
              <span>${event.turn_order !== null ? `#${event.turn_order + 1}` : 'Not set'}</span>
            </div>
          ` : `
            <div class="detail-item full-width">
              <div class="alert alert-info">
                This event is in draft status and not yet scheduled.
              </div>
            </div>
          `}
        </div>
      </div>
    `;

    this.eventModalContent.innerHTML = modalContent;
    this.eventModal.classList.add('active');
  }

  closeEventModal() {
    this.eventModal.classList.remove('active');
  }

  toggleBulkMode() {
    this.state.bulkMode = !this.state.bulkMode;
    this.state.selectedEvents.clear();
    
    this.bulkModeBtn.textContent = this.state.bulkMode ? 'Exit Bulk Mode' : 'Bulk Mode';
    this.bulkActionsBar.classList.toggle('active', this.state.bulkMode);
    
    this.renderSearchResults();
  }

  toggleEventSelection(eventId) {
    if (this.state.selectedEvents.has(eventId)) {
      this.state.selectedEvents.delete(eventId);
    } else {
      this.state.selectedEvents.add(eventId);
    }
    
    this.updateBulkActionsState();
  }

  toggleSelectAll() {
    if (this.state.selectedEvents.size === this.data.searchResults.length) {
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
    this.applyBulkBtn.disabled = !hasSelection;
    
    if (this.selectAllBtn) {
      this.selectAllBtn.textContent = this.state.selectedEvents.size === this.data.searchResults.length ? 
        'Deselect All' : 'Select All';
    }
  }

  async applyBulkOperation() {
    const operation = this.bulkOperationSelect.value;
    const eventIds = Array.from(this.state.selectedEvents);
    
    if (!operation || eventIds.length === 0) {
      this.showNotification('Please select an operation and events', 'warning');
      return;
    }

    this.showLoading(true);
    
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
          data: {} // Add specific data based on operation if needed
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      this.showNotification(result.message, 'success');
      
      // Reload data and reset selections
      await Promise.all([
        this.loadData(),
        this.loadAnalytics()
      ]);
      
      this.state.selectedEvents.clear();
      this.performSearch();
      
      if (this.state.currentView === 'schedule') {
        this.renderScheduleView();
      }

    } catch (error) {
      console.error('Bulk operation error:', error);
      this.showNotification('Error performing bulk operation', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  initializeDragAndDrop() {
    this.sortableInstances.forEach(s => {
      if (s && typeof s.destroy === 'function') {
        s.destroy();
      }
    });
    this.sortableInstances = [];
    
    const containers = [
      this.draftListEl, 
      ...document.querySelectorAll('.room-slot')
    ].filter(Boolean);

    containers.forEach(container => {
      if (container) {
        const sortableInstance = new Sortable(container, {
          group: 'shared',
          animation: 150,
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
          dragClass: 'sortable-drag',
          onEnd: (evt) => this.handleDrop(evt),
        });
        this.sortableInstances.push(sortableInstance);
      }
    });
  }

  async handleDrop(evt) {
    const { item, from, to, newDraggableIndex } = evt;
    const eventId = item.dataset.id;
    
    if (!eventId) return;
    
    this.showLoading(true);
    
    try {
      await this.updateEventPosition(eventId, to, newDraggableIndex);
      
      if (from !== to && from.classList.contains('room-slot')) {
        await this.updateTurnOrdersForContainer(from);
      }
      
      if (to.classList.contains('room-slot')) {
        await this.updateTurnOrdersForContainer(to);
      }
      
      await Promise.all([
        this.loadData(),
        this.loadAnalytics()
      ]);
      
      this.renderScheduleView();
      this.showNotification('Schedule updated successfully', 'success');
    } catch (error) {
      console.error('Error handling drop:', error);
      this.showNotification('Error updating schedule', 'error');
      await this.loadData();
      this.renderScheduleView();
    } finally {
      this.showLoading(false);
    }
  }

  async updateTurnOrdersForContainer(container) {
    if (!container || !container.classList.contains('room-slot')) return;
    
    const cards = Array.from(container.querySelectorAll('.event-card'));
    const updatePromises = cards.map((card, index) => 
      this.updateEventPosition(card.dataset.id, container, index, false)
    );
    
    await Promise.all(updatePromises);
  }

  async updateEventPosition(eventId, container, turnOrder, showNotification = true) {
    const isDraft = container.id === 'draft-list';
    const updatedData = {
      status: isDraft ? 'borrador' : 'publicado',
      scheduled_day: isDraft ? null : container.dataset.day,
      scheduled_time_block: isDraft ? null : container.dataset.time,
      room: isDraft ? null : parseInt(container.dataset.room),
      turn_order: isDraft ? null : turnOrder,
    };

    const response = await fetch('/api/admin/event-manager', {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${this.authToken}` 
      },
      body: JSON.stringify({ eventId, updatedData }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  }

  showLoading(show) {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.toggle('active', show);
    }
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    notification.innerHTML = `
      <span class="notification-message">${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 4000);
  }
}

// Initialize dashboard
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
  dashboard = new EnhancedCongressDashboard();
});