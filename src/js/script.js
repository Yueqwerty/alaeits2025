/**
 * @file ALAEITS 2025 - Lógica del Programa Interactivo
 * @description Gestiona la carga, filtrado y renderizado del programa del evento desde un CSV,
 *              implementando un sistema de favoritos y un diseño de componentes basado en CSS.
 */
document.addEventListener('DOMContentLoaded', () => {

    const App = {
        // --- Configuración y Estado de la Aplicación ---
        masterScheduleURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTeiEquNfK-SqUuAjFui6V6oIOiZPt4rA71hLATqU1h_8HlseDHuBpjW4sm3b0Q5APziFZ7wk9PQG5E/pub?output=csv",
        fullSchedule: [],
        favorites: [],
        currentFilters: { search: '', type: 'all', sala: 'all', horario: 'all' },
        currentDay: '',
        diasConfig: {
            'martes 14 de octubre': { nombreVisible: 'Martes 14' },
            'miércoles 15 de octubre': { nombreVisible: 'Miércoles 15' }
        },
        elements: {}, // Cache para elementos del DOM

        /**
         * Punto de entrada principal de la aplicación.
         */
        init() {
            this.cacheElements();
            this.setupControls();
            this.fetchAndProcessData();
        },
        
        /**
         * Almacena referencias a los elementos del DOM para un acceso más rápido.
         */
        cacheElements() {
            this.elements = {
                programContent: document.getElementById('program-content'),
                favoritesView: document.getElementById('favorites-view'),
                programTabs: document.getElementById('program-tabs'),
                noResults: document.getElementById('no-results'),
                searchInput: document.getElementById('program-search-input'),
                filterType: document.getElementById('filter-type'),
                filterSala: document.getElementById('filter-sala'),
                filterHorario: document.getElementById('filter-horario'),
                resetBtn: document.getElementById('reset-filters'),
            };
        },

        /**
         * Obtiene, parsea y procesa los datos del CSV para inicializar el programa.
         */
        async fetchAndProcessData() {
            try {
                this.loadFavorites();
                const response = await fetch(`${this.masterScheduleURL}&timestamp=${new Date().getTime()}`);
                if (!response.ok) throw new Error("No se pudo cargar el programa. Verifique el enlace del CSV.");
                
                const csvText = await response.text();
                this.fullSchedule = this.processData(this.parseCSV(csvText));
                
                this.populateFilters();
                this.renderTabs();

                this.currentDay = Object.keys(this.diasConfig)[0];
                this.setActiveTab(this.currentDay);
                this.render();
            } catch (error) {
                this.elements.programContent.innerHTML = `<p class="col-span-full text-center text-secondary">${error.message}</p>`;
            }
        },

        parseCSV(text) {
            const headers = text.slice(0, text.indexOf('\n')).trim().split(',');
            const rows = text.slice(text.indexOf('\n') + 1).trim().split('\n');
            return rows.map(row => {
                const values = row.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
                return headers.reduce((obj, header, index) => {
                    const cleanHeader = header.trim().replace(/"/g, '');
                    if (cleanHeader) obj[cleanHeader] = (values[index] || '').trim().replace(/^"|"$/g, '');
                    return obj;
                }, {});
            });
        },

        /**
         * Transforma los datos del CSV en una lista plana de ponencias individuales,
         * donde cada ponencia hereda el contexto de su mesa (sala, horario, etc.).
         */
        processData(data) {
            const mesas = {};
            data.forEach(row => {
                if (!row.ID_Mesa) return;
                if (!mesas[row.ID_Mesa]) {
                    mesas[row.ID_Mesa] = {
                        id: row.ID_Mesa,
                        dia: row.Dia.trim(),
                        horario: row.Horario_Bloque,
                        sala: row.Sala,
                        titulo: row.Titulo_Mesa,
                        esSimposio: row.Tipo_Item === 'Simposio',
                        eje: (row.Titulo_Mesa.match(/^(EJE \d+):/) || [null, null])[1],
                        items: []
                    };
                }
                mesas[row.ID_Mesa].items.push({
                    id: row.ID_Item,
                    titulo: row.Titulo_Item,
                    autores: row.Autores_Item.split(',').map(a => a.trim().replace(/^"|"$/g, '')).filter(Boolean)
                });
            });

            const ponenciasIndividuales = [];
            Object.values(mesas).forEach(mesa => {
                mesa.items.forEach(item => {
                    if (item.id === 'DISC') return;
                    ponenciasIndividuales.push({
                        id: item.id,
                        titulo: item.titulo,
                        autores: item.autores,
                        mesaId: mesa.id,
                        mesaTitulo: mesa.titulo,
                        dia: mesa.dia,
                        horario: mesa.horario,
                        sala: mesa.sala,
                        eje: mesa.eje,
                        esSimposio: mesa.esSimposio
                    });
                });
            });
            return ponenciasIndividuales;
        },

        /**
         * Renderiza el contenido principal basándose en el día y los filtros seleccionados.
         */
        render() {
            this.elements.favoritesView.classList.add('hidden');
            this.elements.programContent.classList.remove('hidden');

            if (this.currentDay === 'favoritos') {
                this.renderFavorites();
                return;
            }
            
            const filteredData = this.fullSchedule.filter(p => {
                const search = this.currentFilters.search.toLowerCase();
                return p.dia.toLowerCase() === this.currentDay.toLowerCase() &&
                    (this.currentFilters.type === 'all' || (this.currentFilters.type === 'simposio' ? p.esSimposio : !p.esSimposio)) &&
                    (this.currentFilters.sala === 'all' || p.sala === this.currentFilters.sala) &&
                    (this.currentFilters.horario === 'all' || p.horario === this.currentFilters.horario) &&
                    (search === '' || p.titulo.toLowerCase().includes(search) || (p.id && p.id.toLowerCase().includes(search)) || p.autores.join(' ').toLowerCase().includes(search) || p.mesaTitulo.toLowerCase().includes(search));
            });
            
            this.elements.programContent.innerHTML = filteredData.length > 0 ? filteredData.map(this.renderCard).join('') : '';
            this.elements.noResults.classList.toggle('hidden', filteredData.length > 0);
            
            this.setupScrollAnimations(this.elements.programContent);
        },
        
        /**
         * Genera el HTML para una tarjeta de ponencia individual.
         * @param {Object} ponencia - El objeto de datos de la ponencia.
         * @returns {string} La cadena de texto HTML para la tarjeta.
         */
        renderCard(ponencia) {
            const isFavorited = App.favorites.includes(ponencia.id);
            const typeClass = ponencia.esSimposio ? 'is-simposio' : 'is-ponencia';
            const moderadorName = ponencia.autores?.[0] || 'N/A';

            return `
            <div class="program-card ${typeClass} animate-on-scroll" style="transform: translateY(30px);">
                <div class="card-content">
                    <button class="favorite-btn" onclick="App.toggleFavorite(event, '${ponencia.id}')">
                        <svg class="${isFavorited ? 'favorited' : ''}" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                    </button>
                    <div class="card-header">MESA: ${ponencia.mesaId} / ID: ${ponencia.id}</div>
                    <h3 class="card-title">${ponencia.titulo}</h3>
                    <p class="card-moderator"><span class="font-bold">Modera:</span> ${moderadorName}</p>
                    <p class="card-authors">${ponencia.autores.join(', ')}</p>
                    ${ponencia.eje ? `<div class="card-eje">${ponencia.eje}</div>` : ''}
                </div>
                <div class="card-footer">
                    <span>${ponencia.horario}</span>
                    <span>SALA ${ponencia.sala}</span>
                </div>
            </div>`;
        },
        
        populateFilters() {
            const salas = [...new Set(this.fullSchedule.map(p => p.sala).filter(Boolean))].sort((a,b) => parseInt(a) - parseInt(b));
            const horarios = [...new Set(this.fullSchedule.map(p => p.horario).filter(Boolean))].sort();
            this.elements.filterSala.innerHTML = '<option value="" disabled selected>Sala</option><option value="all">Todas</option>' + salas.map(s => `<option value="${s}">Sala ${s}</option>`).join('');
            this.elements.filterHorario.innerHTML = '<option value="" disabled selected>Horario</option><option value="all">Todos</option>' + horarios.map(h => `<option value="${h}">${h}</option>`).join('');
            this.elements.filterType.innerHTML = '<option value="" disabled selected>Tipo</option><option value="all">Todos</option><option value="simposio">Simposios</option><option value="ponencia">Ponencias</option>';
        },

        renderTabs() {
            let tabsHTML = Object.entries(this.diasConfig).map(([key, val]) => `<button class="tab-button" data-day="${key}">${val.nombreVisible}</button>`).join('');
            tabsHTML += `<button class="tab-button flex items-center" data-day="favoritos">Mi Horario <span id="fav-count" class="ml-2 bg-primary text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">${this.favorites.length}</span></button>`;
            this.elements.programTabs.innerHTML = tabsHTML;
            this.elements.favCount = document.getElementById('fav-count');
        },

        renderFavorites() {
            this.elements.programContent.classList.add('hidden');
            this.elements.favoritesView.classList.remove('hidden');
            this.elements.favoritesView.innerHTML = `<h2 class="section-title">Mi Horario</h2>`;
            const favoritePonencias = this.fullSchedule.filter(p => this.favorites.includes(p.id));
            const grid = document.createElement('div');
            grid.className = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8';
            if (favoritePonencias.length > 0) {
                grid.innerHTML = favoritePonencias.map(this.renderCard).join('');
            } else {
                grid.innerHTML = '<p class="col-span-full text-center text-text-light">Aún no has guardado ninguna ponencia.</p>';
            }
            this.elements.favoritesView.appendChild(grid);
            this.setupScrollAnimations(this.elements.favoritesView);
        },

        setupControls() {
            const debouncedRender = this.debounce(() => this.render(), 300);

            this.elements.searchInput.addEventListener('input', e => {
                this.currentFilters.search = e.target.value;
                debouncedRender();
            });

            ['Type', 'Sala', 'Horario'].forEach(type => {
                this.elements[`filter${type}`].addEventListener('change', e => {
                    this.currentFilters[type.toLowerCase()] = e.target.value;
                    this.render();
                });
            });

            this.elements.resetBtn.addEventListener('click', () => {
                this.currentFilters = { search: '', type: 'all', sala: 'all', horario: 'all' };
                this.elements.searchInput.value = '';
                ['Type', 'Sala', 'Horario'].forEach(type => {
                    const select = this.elements[`filter${type}`];
                    select.selectedIndex = 0;
                    // Forzar un 'change' para que los placeholders se mantengan si es necesario
                    select.dispatchEvent(new Event('change'));
                });
                this.render();
            });

            this.elements.programTabs.addEventListener('click', e => {
                const button = e.target.closest('.tab-button');
                if (button) {
                    this.currentDay = button.dataset.day;
                    this.setActiveTab(this.currentDay);
                    this.render();
                }
            });
        },

        setActiveTab(day) {
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.day === day);
            });
        },
        
        loadFavorites() {
            this.favorites = JSON.parse(localStorage.getItem('alaeitsFavorites_v2') || '[]');
        },
        
        saveFavorites() {
            localStorage.setItem('alaeitsFavorites_v2', JSON.stringify(this.favorites));
            if (this.elements.favCount) {
                this.elements.favCount.textContent = this.favorites.length;
            }
        },

        toggleFavorite(event, id) {
            event.stopPropagation();
            const svg = event.currentTarget.querySelector('svg');
            if (this.favorites.includes(id)) {
                this.favorites = this.favorites.filter(favId => favId !== id);
                svg.classList.remove('favorited');
            } else {
                this.favorites.push(id);
                svg.classList.add('favorited');
            }
            this.saveFavorites();
            if (this.currentDay === 'favoritos') {
                this.render();
            }
        },

        /**
         * Inicializa el IntersectionObserver para animar elementos al entrar en el viewport.
         * @param {HTMLElement} container - El elemento padre que contiene los elementos a animar.
         */
        setupScrollAnimations(container = document) {
            const elementsToAnimate = container.querySelectorAll('.animate-on-scroll');
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });
            elementsToAnimate.forEach(el => observer.observe(el));
        },
        
        /**
         * Retrasa la ejecución de una función para evitar llamadas excesivas (ej. en búsqueda).
         * @param {Function} func - La función a ejecutar.
         * @param {number} delay - El tiempo de espera en milisegundos.
         * @returns {Function} La función con el debounce aplicado.
         */
        debounce(func, delay) {
            let timeoutId;
            return (...args) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    func.apply(this, args);
                }, delay);
            };
        }
    };

    window.App = App;
    App.init();
});