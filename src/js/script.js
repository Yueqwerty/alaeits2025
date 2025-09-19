/**
 * @file ALAEITS 2025 - Sistema de Programa Interactivo
 * @description Sistema profesional para mostrar el programa del seminario
 * @version 2.0.0
 * @author ALAEITS Team
 */

class ALAEITSProgramManager {
    constructor() {
        // Configuración del sistema
        this.config = {
            apiEndpoint: '/api/events-public',
            storageKey: 'alaeits_favorites_v2',
            debounceDelay: 300,
            animationDuration: 350,
            retryAttempts: 3,
            diasConfig: {
                'martes 14 de octubre': { 
                    nombreVisible: 'Martes 14',
                    orden: 1
                },
                'miércoles 15 de octubre': { 
                    nombreVisible: 'Miércoles 15',
                    orden: 2 
                }
            }
        };

        // Estado de la aplicación
        this.state = {
            fullSchedule: [],
            filteredData: [],
            favorites: new Set(),
            currentDay: '',
            filters: {
                search: '',
                type: 'all',
                sala: 'all',
                horario: 'all'
            },
            loading: false,
            initialized: false
        };

        // Cache de elementos DOM
        this.elements = {};
        
        // Controladores de eventos
        this.abortController = null;
        this.debounceTimers = new Map();
        
        // Métricas de rendimiento
        this.metrics = {
            loadTime: 0,
            renderTime: 0,
            searchTime: 0
        };

        this.init();
    }

    /**
     * Inicialización del sistema
     */
        async init() {
        const startTime = performance.now();
        
        try {
            await this.waitForDOM();
            this.cacheElements();
            this.ensureToastContainer(); // ✅ CORREGIDO - Agregados paréntesis
            this.loadFavorites();
            this.setupEventListeners();
            
            await this.loadData();
            
            // ✅ MOVER ESTA LÍNEA ANTES DE setupInitialView
            this.state.initialized = true;
            
            this.setupInitialView();
            
            this.metrics.loadTime = performance.now() - startTime;
            this.log(`Sistema inicializado en ${this.metrics.loadTime.toFixed(2)}ms`);
            
        } catch (error) {
            this.handleError('Error durante la inicialización', error);
        }
    }

    /**
     * Esperar a que el DOM esté listo
     */
    waitForDOM() {
        return new Promise((resolve) => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', resolve);
            } else {
                resolve();
            }
        });
    }

    /**
     * Cache inteligente de elementos DOM
     */
    cacheElements() {
        const selectors = {
            programContent: '#program-content',
            favoritesView: '#favorites-view',
            programTabs: '#program-tabs',
            noResults: '#no-results',
            
            searchInput: '#program-search-input',
            filterType: '#filter-type',
            filterSala: '#filter-sala', 
            filterHorario: '#filter-horario',
            resetBtn: '#reset-filters',
            clearFiltersNoResultsBtn: '#clear-filters-no-results',
            
            toastContainer: '#toast-container',
            header: '.main-header'
        };

        Object.entries(selectors).forEach(([key, selector]) => {
            const element = document.querySelector(selector);
            if (element) {
                this.elements[key] = element;
            } else {
                // Solo mostrar warning para elementos realmente importantes
                if (!['toastContainer', 'noResults', 'header'].includes(key)) {
                    this.warn(`Elemento no encontrado: ${selector}`);
                }
            }
        });

        this.log('Elementos DOM cacheados exitosamente');
    }

    /**
     * Carga de datos desde la API
     */
    async loadData() {
        this.setLoading(true);
        let attempt = 0;

        while (attempt < this.config.retryAttempts) {
            try {
                this.log(`Intento ${attempt + 1} de carga de datos`);
                
                if (this.abortController) {
                    this.abortController.abort();
                }
                this.abortController = new AbortController();

                const response = await fetch(this.config.apiEndpoint, {
                    headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    },
                    signal: this.abortController.signal
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.error || 'Error desconocido en la respuesta');
                }

                this.state.fullSchedule = this.processAPIData(result.data || []);
                this.log(`Datos cargados: ${this.state.fullSchedule.length} eventos`);
                
                this.populateFilters();
                return;

            } catch (error) {
                attempt++;
                if (error.name === 'AbortError') {
                    this.log('Petición cancelada');
                    return;
                }

                this.warn(`Error en intento ${attempt}:`, error.message);
                
                if (attempt >= this.config.retryAttempts) {
                    this.handleLoadError(error);
                    return;
                }

                // Esperar antes del siguiente intento
                await this.delay(1000 * attempt);
            }
        }
    }

    /**
     * Procesamiento de datos de la API
     */
    processAPIData(rawData) {
        if (!Array.isArray(rawData)) {
            this.warn('Datos recibidos no son un array:', rawData);
            return [];
        }

        return rawData.map(item => {
            try {
                return this.normalizeEventData(item);
            } catch (error) {
                this.warn('Error procesando evento:', item, error);
                return null;
            }
        }).filter(Boolean);
    }

    /**
     * Normalización de datos de evento
     */
    normalizeEventData(event) {
        const normalized = {
            // Campos básicos
            id: this.safeString(event.id),
            titulo: this.safeString(event.titulo),
            
            // Autores - manejo robusto
            autores: this.normalizeAuthors(event.autores),
            
            // Mesa información
            mesaId: this.safeString(event.mesaId),
            mesaTitulo: this.safeString(event.mesaTitulo),
            
            // Programación
            dia: this.safeString(event.dia),
            horario: this.safeString(event.horario),
            sala: this.safeString(event.sala),
            
            // Metadata
            eje: this.safeString(event.eje),
            esSimposio: Boolean(event.esSimposio),
            turnOrder: this.safeNumber(event.turnOrder),
            
            // Campos derivados
            typeClass: event.esSimposio ? 'is-simposio' : 'is-ponencia',
            searchText: '', // Se llenará después
        };

        // Crear texto de búsqueda
        normalized.searchText = [
            normalized.id,
            normalized.titulo,
            normalized.autores.join(' '),
            normalized.mesaTitulo,
            normalized.eje
        ].join(' ').toLowerCase();

        return normalized;
    }

    /**
     * Normalización segura de autores
     */
    normalizeAuthors(authors) {
        if (!authors) return [];
        
        if (Array.isArray(authors)) {
            return authors.map(a => this.safeString(a)).filter(Boolean);
        }
        
        if (typeof authors === 'string') {
            return authors.split(',').map(a => a.trim()).filter(Boolean);
        }
        
        return [];
    }

    /**
     * Helpers de validación
     */
    safeString(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value.trim();
        if (typeof value === 'object') return '';
        return String(value).trim();
    }

    safeNumber(value) {
        if (value === null || value === undefined) return null;
        const num = Number(value);
        return isNaN(num) ? null : num;
    }

    /**
     * Configuración inicial de la vista
     */
        setupInitialView() {
            this.renderTabs();
            this.applyStateFromURL();
            
            if (!this.state.currentDay) {
                const firstDay = Object.keys(this.config.diasConfig)[0];
                this.state.currentDay = firstDay;
            }
            
            this.setActiveTab(this.state.currentDay);
            this.performSearch();
        }

    /**
     * Configuración de event listeners
     */
    setupEventListeners() {
        // Búsqueda con debounce
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', 
                this.debounce('search', (e) => {
                    this.state.filters.search = e.target.value.trim();
                    this.performSearch();
                }, this.config.debounceDelay)
            );
        }

        // Filtros
        ['filterType', 'filterSala', 'filterHorario'].forEach(filterKey => {
            const element = this.elements[filterKey];
            if (element) {
                element.addEventListener('change', (e) => {
                    const filterName = filterKey.replace('filter', '').toLowerCase();
                    this.state.filters[filterName] = e.target.value;
                    this.performSearch();
                    this.updateURL();
                });
            }
        });

        // Botones de reset
        [this.elements.resetBtn, this.elements.clearFiltersNoResultsBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => this.resetFilters());
            }
        });

        // Tabs
        if (this.elements.programTabs) {
            this.elements.programTabs.addEventListener('click', (e) => {
                const button = e.target.closest('.tab-button');
                if (button && button.dataset.day) {
                    this.switchDay(button.dataset.day);
                }
            });
        }

        // Scroll header effect
        if (this.elements.header) {
            let ticking = false;
            window.addEventListener('scroll', () => {
                if (!ticking) {
                    requestAnimationFrame(() => {
                        this.elements.header.classList.toggle('scrolled', window.scrollY > 50);
                        ticking = false;
                    });
                    ticking = true;
                }
            });
        }

        // Delegación de eventos para tarjetas
        document.addEventListener('click', (e) => {
            // Favoritos
            if (e.target.closest('.favorite-btn')) {
                e.preventDefault();
                e.stopPropagation();
                const card = e.target.closest('.program-card');
                if (card) {
                    this.toggleFavorite(card.dataset.eventId);
                }
                return;
            }

            // Compartir
            if (e.target.closest('.share-btn')) {
                e.preventDefault();
                e.stopPropagation();
                const card = e.target.closest('.program-card');
                if (card) {
                    this.shareEvent(card.dataset.eventId);
                }
                return;
            }
        });

        this.log('Event listeners configurados');
    }

    /**
     * Función debounce mejorada
     */
    debounce(key, func, delay) {
        return (...args) => {
            clearTimeout(this.debounceTimers.get(key));
            this.debounceTimers.set(key, setTimeout(() => func.apply(this, args), delay));
        };
    }

    /**
     * Búsqueda y filtrado
     */
    performSearch() {
        const startTime = performance.now();
        
        let filteredData = [...this.state.fullSchedule];

        // Filtro por día (excepto favoritos)
        if (this.state.currentDay !== 'favoritos') {
            filteredData = filteredData.filter(event => 
                event.dia.toLowerCase() === this.state.currentDay.toLowerCase()
            );
        }

        // Filtro por favoritos
        if (this.state.currentDay === 'favoritos') {
            filteredData = filteredData.filter(event => 
                this.state.favorites.has(event.id)
            );
        }

        // Filtro de búsqueda
        if (this.state.filters.search) {
            const searchTerm = this.state.filters.search.toLowerCase();
            filteredData = filteredData.filter(event => 
                event.searchText.includes(searchTerm)
            );
        }

        // Filtros adicionales
        ['type', 'sala', 'horario'].forEach(filterType => {
            const filterValue = this.state.filters[filterType];
            if (filterValue && filterValue !== 'all') {
                filteredData = filteredData.filter(event => {
                    switch (filterType) {
                        case 'type':
                            return filterValue === 'simposio' ? event.esSimposio : !event.esSimposio;
                        case 'sala':
                            return event.sala === filterValue;
                        case 'horario':
                            return event.horario === filterValue;
                        default:
                            return true;
                    }
                });
            }
        });

        this.state.filteredData = filteredData;
        this.metrics.searchTime = performance.now() - startTime;
        
        this.render();
    }

    /**
     * Renderizado principal
     */
    async render() {
        if (!this.state.initialized) return;
        
        const startTime = performance.now();
        this.setLoading(true);

        try {
            // Pequeño delay para transición suave
            await this.delay(50);

            if (this.state.currentDay === 'favoritos') {
                this.renderFavoritesView();
            } else {
                this.renderProgramView();
            }

            this.updateNoResultsState();
            this.metrics.renderTime = performance.now() - startTime;
            
        } catch (error) {
            this.handleError('Error durante el renderizado', error);
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Renderizar vista de programa
     */
    renderProgramView() {
        if (!this.elements.programContent) return;

        this.elements.programContent.classList.remove('hidden');
        if (this.elements.favoritesView) {
            this.elements.favoritesView.classList.add('hidden');
        }

        // Limpiar contenido previo
        this.elements.programContent.innerHTML = '';

        // Crear el contenedor grid
        const gridContainer = document.createElement('div');
        gridContainer.className = 'program-content-grid';
        
        // Si no hay datos, mostrar mensaje
        if (this.state.filteredData.length === 0) {
            gridContainer.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <div class="text-gray-400 mb-4">
                        <svg class="mx-auto h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" 
                                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                    </div>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">No hay eventos disponibles</h3>
                    <p class="text-gray-600">Prueba ajustando los filtros o selecciona otro día</p>
                </div>
            `;
        } else {
            // Crear fragment para mejor rendimiento
            const fragment = document.createDocumentFragment();
            
            this.state.filteredData.forEach(event => {
                const card = this.createEventCard(event);
                fragment.appendChild(card);
            });
            
            gridContainer.appendChild(fragment);
        }

        // Agregar el grid al contenedor principal
        this.elements.programContent.appendChild(gridContainer);
    }

    /*
     * Renderizar vista de favoritos
     */
    renderFavoritesView() {
        if (!this.elements.favoritesView || !this.elements.programContent) return;

        this.elements.programContent.classList.add('hidden');
        this.elements.favoritesView.classList.remove('hidden');

        // Primero, limpiar el contenido anterior del contenedor de favoritos
        this.elements.favoritesView.innerHTML = '';

        const favoriteEvents = this.state.fullSchedule.filter(event => 
            this.state.favorites.has(event.id)
        );
        
        if (favoriteEvents.length > 0) {
            // --- CORRECCIÓN CLAVE ---
            // Se crea el contenedor de la parrilla como un elemento DOM,
            // igual que en la vista del programa principal.
            const gridContainer = document.createElement('div');
            gridContainer.className = 'program-content-grid';
            
            // Se añaden todas las tarjetas de eventos favoritos a la parrilla
            favoriteEvents.forEach(event => {
                gridContainer.appendChild(this.createEventCard(event));
            });

            // Finalmente, se añade la parrilla completa (con todas sus tarjetas)
            // al contenedor principal de la vista de favoritos.
            this.elements.favoritesView.appendChild(gridContainer);

        } else {
            // Si no hay favoritos, se muestra el mensaje como antes.
            const noFavoritesHTML = `
                <div class="text-center py-12">
                    <div class="text-gray-400 mb-4">
                        <svg class="mx-auto h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" 
                                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                    </div>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">No has guardado ningún evento</h3>
                    <p class="text-gray-600 mb-6">Guarda eventos como favoritos para crear tu horario personalizado</p>
                    <button onclick="document.querySelector('[data-day=\\'${Object.keys(this.config.diasConfig)[0]}\\']')?.click()" 
                            class="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                        Explorar Programa
                    </button>
                </div>
            `;
            this.elements.favoritesView.innerHTML = noFavoritesHTML;
        }
    }

    ensureToastContainer() {
        if (!this.elements.toastContainer) {
            const container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
            this.elements.toastContainer = container;
        }
    }

    /**
     * Crear tarjeta de evento (MÉTODO CORREGIDO)
     */
    createEventCard(event) {
        const card = document.createElement('div');
        card.className = `program-card ${event.typeClass}`;
        card.dataset.eventId = event.id;

        const isFavorited = this.state.favorites.has(event.id);
        const searchQuery = this.state.filters.search;
        
        // Información de visualización
        const diaVisible = this.config.diasConfig[event.dia]?.nombreVisible || event.dia || '--';
        const horarioVisible = event.horario || '--';
        const salaVisible = event.sala ? `SALA ${event.sala}` : '--';
        const moderadorName = event.autores[0] || 'N/A';
        const autoresTexto = event.autores.join(', ') || 'Sin autores';

        // Highlighting para búsqueda
        const titulo = searchQuery ? this.highlightText(event.titulo, searchQuery) : event.titulo;
        const autores = searchQuery ? this.highlightText(autoresTexto, searchQuery) : autoresTexto;

        card.innerHTML = `
            <div class="card-content">
                <button class="favorite-btn" title="${isFavorited ? 'Quitar de favoritos' : 'Agregar a favoritos'}">
                    <svg class="${isFavorited ? 'favorited' : ''}" viewBox="0 0 24 24">
                        <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                </button>
                <button class="share-btn" title="Compartir evento">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 4.186 2.25 2.25 0 000-4.186zM14.333 4.427a2.25 2.25 0 100 4.186 2.25 2.25 0 000-4.186zM6.35 15.345a2.25 2.25 0 100 4.186 2.25 2.25 0 000-4.186zM15.75 12a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z" />
                    </svg>
                </button>
                <div class="card-header">MESA: ${event.mesaId} / ID: ${event.id}</div>
                <h3 class="card-title">${titulo}</h3>
                <p class="card-moderator"><span class="font-bold">Modera:</span> ${moderadorName}</p>
                <p class="card-authors">${autores}</p>
                <div class="card-tags">
                    ${event.eje ? `<div class="card-eje">${event.eje}</div>` : ''}
                    ${event.turnOrder !== null ? `<div class="card-turn-order">Turno: ${event.turnOrder + 1}</div>` : ''}
                </div>
            </div>
            <div class="card-footer">
                <span>${horarioVisible}</span>
                <span>${diaVisible}</span>
                <span>${salaVisible}</span>
            </div>
        `;

        return card;
    }

    /**
     * Highlighting de texto para búsqueda
     */
    highlightText(text, query) {
        if (!query || !text) return text;
        
        const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Poblar filtros dinámicamente
     */
    populateFilters() {
        // Salas únicas
        const salas = [...new Set(this.state.fullSchedule
            .map(event => event.sala)
            .filter(Boolean)
        )].sort((a, b) => parseInt(a) - parseInt(b));

        // Horarios únicos
        const horarios = [...new Set(this.state.fullSchedule
            .map(event => event.horario)
            .filter(Boolean)
        )].sort();

        // Actualizar selects
        if (this.elements.filterSala) {
            this.elements.filterSala.innerHTML = 
                '<option value="all">Todas las Salas</option>' +
                salas.map(sala => `<option value="${sala}">Sala ${sala}</option>`).join('');
        }

        if (this.elements.filterHorario) {
            this.elements.filterHorario.innerHTML = 
                '<option value="all">Todos los Horarios</option>' +
                horarios.map(horario => `<option value="${horario}">${horario}</option>`).join('');
        }

        if (this.elements.filterType) {
            this.elements.filterType.innerHTML = `
                <option value="all">Todo Tipo</option>
                <option value="simposio">Simposios</option>
                <option value="ponencia">Ponencias</option>
            `;
        }

        this.log('Filtros poblados exitosamente');
    }

    /**
     * Renderizar tabs
     */
    renderTabs() {
        if (!this.elements.programTabs) return;

        const tabs = Object.entries(this.config.diasConfig)
            .map(([key, config]) => 
                `<button class="tab-button" data-day="${key}">${config.nombreVisible}</button>`
            )
            .join('');

        const favoritesCount = this.state.favorites.size;
        const favoritesTab = `
            <button class="tab-button flex items-center" data-day="favoritos">
                Mi Horario 
                <span id="fav-count" class="ml-2 bg-primary text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    ${favoritesCount}
                </span>
            </button>
        `;

        this.elements.programTabs.innerHTML = tabs + favoritesTab;
    }

    /**
     * Cambiar día activo
     */
    switchDay(day) {
        if (this.state.currentDay === day) return;
        
        this.state.currentDay = day;
        this.setActiveTab(day);
        this.performSearch();
        this.updateURL();
    }

    /**
     * Establecer tab activo
     */
    setActiveTab(day) {
        if (!this.elements.programTabs) return;

        this.elements.programTabs.querySelectorAll('.tab-button').forEach(button => {
            button.classList.toggle('active', button.dataset.day === day);
        });
    }

    /**
     * Manejo de favoritos
     */
    loadFavorites() {
        try {
            const stored = localStorage.getItem(this.config.storageKey);
            const favorites = stored ? JSON.parse(stored) : [];
            this.state.favorites = new Set(favorites);
            this.log(`Favoritos cargados: ${this.state.favorites.size}`);
        } catch (error) {
            this.warn('Error cargando favoritos:', error);
            this.state.favorites = new Set();
        }
    }

    saveFavorites() {
        try {
            const favorites = Array.from(this.state.favorites);
            localStorage.setItem(this.config.storageKey, JSON.stringify(favorites));
            this.updateFavoritesCount();
        } catch (error) {
            this.warn('Error guardando favoritos:', error);
        }
    }

    toggleFavorite(eventId) {
        if (!eventId) return;

        if (this.state.favorites.has(eventId)) {
            this.state.favorites.delete(eventId);
            this.showToast('Evento removido de favoritos', 'info');
        } else {
            this.state.favorites.add(eventId);
            this.showToast('Evento agregado a favoritos', 'success');
        }

        this.saveFavorites();
        
        // Actualizar UI de la tarjeta específica
        const card = document.querySelector(`[data-event-id="${eventId}"]`);
        if (card) {
            const btn = card.querySelector('.favorite-btn svg');
            const isFavorited = this.state.favorites.has(eventId);
            btn?.classList.toggle('favorited', isFavorited);
            
            const favoriteBtn = card.querySelector('.favorite-btn');
            if (favoriteBtn) {
                favoriteBtn.title = isFavorited ? 'Quitar de favoritos' : 'Agregar a favoritos';
            }
        }

        // Re-render si estamos en vista de favoritos
        if (this.state.currentDay === 'favoritos') {
            this.render();
        }
    }

    updateFavoritesCount() {
        const countElement = document.getElementById('fav-count');
        if (countElement) {
            countElement.textContent = this.state.favorites.size;
        }
    }

    /**
     * Compartir evento
     */
    async shareEvent(eventId) {
        if (!eventId) return;

        const event = this.state.fullSchedule.find(e => e.id === eventId);
        if (!event) return;

        const url = new URL(window.location);
        url.hash = `dia=${encodeURIComponent(event.dia)}&evento=${encodeURIComponent(eventId)}`;

        try {
            if (navigator.share) {
                await navigator.share({
                    title: event.titulo,
                    text: `${event.titulo} - ALAEITS 2025`,
                    url: url.href
                });
            } else {
                await navigator.clipboard.writeText(url.href);
                this.showToast('Enlace copiado al portapapeles', 'success');
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.warn('Error compartiendo:', error);
                this.showToast('Error al compartir el evento', 'error');
            }
        }
    }

    /**
     * Reset de filtros
     */
    resetFilters() {
        this.state.filters = {
            search: '',
            type: 'all',
            sala: 'all',
            horario: 'all'
        };

        // Limpiar inputs
        if (this.elements.searchInput) this.elements.searchInput.value = '';
        if (this.elements.filterType) this.elements.filterType.selectedIndex = 0;
        if (this.elements.filterSala) this.elements.filterSala.selectedIndex = 0;
        if (this.elements.filterHorario) this.elements.filterHorario.selectedIndex = 0;

        this.performSearch();
        this.updateURL();
        this.showToast('Filtros reiniciados', 'info');
    }

    /**
     * Estado de sin resultados
     */
    updateNoResultsState() {
        if (!this.elements.noResults) return;

        const hasResults = this.state.filteredData.length > 0;
        const hasActiveFilters = this.hasActiveFilters();

        this.elements.noResults.classList.toggle('hidden', hasResults);

        if (!hasResults && this.elements.noResults) {
            let message = 'No se encontraron eventos.';
            
            if (hasActiveFilters) {
                message = 'No hay eventos que coincidan con los filtros aplicados.';
            } else if (this.state.currentDay === 'favoritos') {
                message = 'No has guardado ningún evento como favorito.';
            }

            this.elements.noResults.querySelector('p')?.textContent || (this.elements.noResults.innerHTML = `<p class="text-center text-gray-600">${message}</p>`);
        }
    }

    hasActiveFilters() {
        return this.state.filters.search !== '' ||
               this.state.filters.type !== 'all' ||
               this.state.filters.sala !== 'all' ||
               this.state.filters.horario !== 'all';
    }

    /**
     * Manejo de URL y estado
     */
    updateURL() {
        const params = new URLSearchParams();
        
        if (this.state.currentDay) {
            params.set('dia', this.state.currentDay);
        }
        
        Object.entries(this.state.filters).forEach(([key, value]) => {
            if (value && value !== 'all' && value !== '') {
                params.set(key, value);
            }
        });

        const newHash = params.toString();
        if (window.location.hash.substring(1) !== newHash) {
            history.replaceState(null, '', `#${newHash}`);
        }
    }

    applyStateFromURL() {
        const params = new URLSearchParams(window.location.hash.substring(1));
        
        // Aplicar día
        const diaParam = params.get('dia');
        if (diaParam && (this.config.diasConfig[diaParam] || diaParam === 'favoritos')) {
            this.state.currentDay = diaParam;
        } else {
            this.state.currentDay = Object.keys(this.config.diasConfig)[0];
        }

        // Aplicar filtros
        this.state.filters = {
            search: params.get('search') || '',
            type: params.get('type') || 'all',
            sala: params.get('sala') || 'all',
            horario: params.get('horario') || 'all'
        };

        // Actualizar inputs
        this.syncFiltersToInputs();

        // Manejar evento específico
        const eventoParam = params.get('evento');
        if (eventoParam) {
            setTimeout(() => this.highlightEvent(eventoParam), 500);
        }
    }

    syncFiltersToInputs() {
        if (this.elements.searchInput) {
            this.elements.searchInput.value = this.state.filters.search;
        }
        if (this.elements.filterType) {
            this.elements.filterType.value = this.state.filters.type;
        }
        if (this.elements.filterSala) {
            this.elements.filterSala.value = this.state.filters.sala;
        }
        if (this.elements.filterHorario) {
            this.elements.filterHorario.value = this.state.filters.horario;
        }
    }

    highlightEvent(eventId) {
        const card = document.querySelector(`[data-event-id="${eventId}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.outline = '3px solid var(--color-primary)';
            card.style.transform = 'scale(1.02)';
            
            setTimeout(() => {
                card.style.outline = '';
                card.style.transform = '';
            }, 2500);
        }
    }

    /**
     * UI Helpers
     */
    setLoading(loading) {
        this.state.loading = loading;
        
        if (this.elements.programContent) {
            this.elements.programContent.classList.toggle('loading', loading);
        }
        
        document.body.style.cursor = loading ? 'wait' : '';
    }

    showToast(message, type = 'info') {
        if (!this.elements.toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        this.elements.toastContainer.appendChild(toast);

        // Auto-remove
        setTimeout(() => {
            toast.classList.add('out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Error handling
     */
    handleError(context, error) {
        this.error(`${context}:`, error);
        
        if (this.elements.programContent) {
            this.elements.programContent.innerHTML = this.createErrorHTML(context, error);
        }
    }

    handleLoadError(error) {
        const errorHTML = `
            <div class="col-span-full text-center p-8">
                <div class="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
                    <div class="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mx-auto mb-4">
                        <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    </div>
                    <h3 class="text-lg font-semibold text-gray-900 mb-2">Error de conexión</h3>
                    <p class="text-gray-700 mb-4">No se pudo cargar el programa del seminario. Por favor intenta nuevamente.</p>
                    <button onclick="location.reload()" 
                            class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
                        Reintentar
                    </button>
                </div>
            </div>
        `;

        if (this.elements.programContent) {
            this.elements.programContent.innerHTML = errorHTML;
        }
    }

    createErrorHTML(context, error) {
        return `
            <div class="text-center p-8">
                <h3 class="text-lg font-semibold text-red-600 mb-2">${context}</h3>
                <p class="text-gray-600">${error.message}</p>
            </div>
        `;
    }

    /**
     * Utilities
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    log(...args) {
        console.log('[ALAEITS]', ...args);
    }

    warn(...args) {
        console.warn('[ALAEITS]', ...args);
    }

    error(...args) {
        console.error('[ALAEITS]', ...args);
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.abortController) {
            this.abortController.abort();
        }
        
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();
        
        this.log('Sistema destruido');
    }
}

// Inicialización global
window.ALAEITSProgramManager = ALAEITSProgramManager;
const programManager = new ALAEITSProgramManager();

// Cleanup al cerrar
window.addEventListener('beforeunload', () => {
    if (window.programManager) {
        window.programManager.destroy();
    }
});

// Exponer para compatibilidad
window.App = {
    toggleFavorite: (event, id) => {
        event.preventDefault();
        event.stopPropagation();
        programManager.toggleFavorite(id);
    },
    sharePonencia: (id) => {
        programManager.shareEvent(id);
    }
};