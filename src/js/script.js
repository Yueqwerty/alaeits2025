/**
 * ALAEITS 2025 - Lógica del Programa Interactivo
 * 
 * Este script gestiona la carga, el filtrado y la visualización del programa del evento.
 * Características principales:
 * - Carga de datos desde un CSV público de Google Sheets.
 * - Transformación de datos en una lista de ponencias individuales.
 * - Filtrado dinámico por búsqueda de texto, tipo, sala y horario.
 * - Sistema de "Mi Horario" con favoritos guardados en localStorage.
 * - Renderizado de tarjetas de ponencia individuales.
 * - Optimización de rendimiento con debounce para la búsqueda.
 * - Animaciones de entrada para elementos al hacer scroll.
 */
document.addEventListener('DOMContentLoaded', () => {

    const App = {
        // --- PROPIEDADES DE ESTADO Y CONFIGURACIÓN ---
        masterScheduleURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTeiEquNfK-SqUuAjFui6V6oIOiZPt4rA71hLATqU1h_8HlseDHuBpjW4sm3b0Q5APziFZ7wk9PQG5E/pub?output=csv",
        fullSchedule: [],
        favorites: [],
        currentFilters: { search: '', type: 'all', sala: 'all', horario: 'all' },
        currentDay: '',
        diasConfig: {
            'martes 14 de octubre': { nombreVisible: 'Martes 14' },
            'miércoles 15 de octubre': { nombreVisible: 'Miércoles 15' }
        },
        elements: {},

        // --- INICIALIZACIÓN ---
        init() {
            this.cacheElements();
            this.setupControls();
            this.fetchAndProcessData();
        },

        cacheElements() {
            this.elements.programContent = document.getElementById('program-content');
            this.elements.favoritesView = document.getElementById('favorites-view');
            this.elements.programTabs = document.getElementById('program-tabs');
            this.elements.noResults = document.getElementById('no-results');
            this.elements.searchInput = document.getElementById('program-search-input');
            this.elements.filterType = document.getElementById('filter-type');
            this.elements.filterSala = document.getElementById('filter-sala');
            this.elements.filterHorario = document.getElementById('filter-horario');
            this.elements.resetBtn = document.getElementById('reset-filters');
            this.elements.favCount = null;
        },

        // --- MANEJO DE DATOS ---
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
                    if (cleanHeader) {
                        obj[cleanHeader] = (values[index] || '').trim().replace(/^"|"$/g, '');
                    }
                    return obj;
                }, {});
            });
        },

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
                    // CORRECCIÓN: Separar autores por coma (,) en lugar de punto y coma (;)
                    autores: row.Autores_Item.split(',').map(a => a.trim())
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

        // --- RENDERIZADO ---
        render() {
            this.elements.favoritesView.classList.add('hidden');
            this.elements.programContent.classList.remove('hidden');

            if (this.currentDay === 'favoritos') {
                this.renderFavorites();
                return;
            }

            const filteredData = this.fullSchedule.filter(ponencia => {
                const search = this.currentFilters.search.toLowerCase();
                const matchSearch = search === '' ||
                    ponencia.titulo.toLowerCase().includes(search) ||
                    (ponencia.id && ponencia.id.toLowerCase().includes(search)) ||
                    ponencia.autores.join(' ').toLowerCase().includes(search) ||
                    ponencia.mesaTitulo.toLowerCase().includes(search);
                
                return ponencia.dia.toLowerCase() === this.currentDay.toLowerCase() &&
                    (this.currentFilters.type === 'all' || (this.currentFilters.type === 'simposio' ? ponencia.esSimposio : !ponencia.esSimposio)) &&
                    (this.currentFilters.sala === 'all' || ponencia.sala === this.currentFilters.sala) &&
                    (this.currentFilters.horario === 'all' || ponencia.horario === this.currentFilters.horario) &&
                    matchSearch;
            });
            
            if (filteredData.length > 0) {
                this.elements.programContent.innerHTML = filteredData.map(this.renderCard).join('');
                this.elements.noResults.classList.add('hidden');
            } else {
                this.elements.programContent.innerHTML = '';
                this.elements.noResults.classList.remove('hidden');
            }
            this.setupScrollAnimations();
        },
        
        renderCard(ponencia) {
            const { id, titulo, autores, horario, sala, eje, esSimposio, mesaId } = ponencia;
            const isFavorited = App.favorites.includes(id);
            const typeClass = esSimposio ? 'border-primary' : 'border-secondary';
            const moderadorName = autores && autores.length > 0 ? autores[0] : 'N/A';

            return `
            <div class="bg-surface/70 backdrop-blur-md rounded-card shadow-card hover:shadow-card-hover transition-shadow duration-300 flex flex-col border-l-4 ${typeClass}" data-animate>
                <div class="p-6 flex-grow flex flex-col relative">
                    <button class="favorite-btn" onclick="App.toggleFavorite(event, '${id}')">
                        <svg class="w-6 h-6 ${isFavorited ? 'favorited' : ''}" viewBox="0 0 24 24" stroke-width="2"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                    </button>
                    <span class="text-xs font-bold uppercase text-text-light mb-2">MESA: ${mesaId} / ID: ${id}</span>
                    <h3 class="text-xl font-bold text-text-dark mb-2">${titulo}</h3>
                    <p class="text-sm text-text-dark mb-2">
                        <span class="font-bold">Modera:</span> ${moderadorName}
                    </p>
                    <p class="text-text-light text-sm font-medium mb-4 flex-grow">${autores.join(', ')}</p>
                    ${eje ? `<span class="bg-primary/10 text-primary font-bold text-xs py-1 px-3 rounded-full self-start">${eje}</span>` : ''}
                </div>
                <div class="bg-black/5 p-4 text-sm font-bold text-text-light flex justify-between rounded-b-card">
                    <span>${horario}</span>
                    <span>SALA ${sala}</span>
                </div>
            </div>`;
        },
        
        populateFilters() {
            const salas = [...new Set(this.fullSchedule.map(p => p.sala).filter(Boolean))].sort((a,b) => parseInt(a) - parseInt(b));
            const horarios = [...new Set(this.fullSchedule.map(p => p.horario).filter(Boolean))].sort();
            this.elements.filterSala.innerHTML = '<option value="all">Todas las Salas</option>' + salas.map(s => `<option value="${s}">Sala ${s}</option>`).join('');
            this.elements.filterHorario.innerHTML = '<option value="all">Todos Horarios</option>' + horarios.map(h => `<option value="${h}">${h}</option>`).join('');
            this.elements.filterType.innerHTML = '<option value="all">Todo Tipo</option><option value="simposio">Simposios</option><option value="ponencia">Ponencias</option>';
        },

        renderTabs() {
            let tabsHTML = Object.entries(this.diasConfig).map(([key, val]) => `<button class="tab-button text-lg mx-4 py-2 font-bold text-text-light border-b-4 border-transparent transition-colors" data-day="${key}">${val.nombreVisible}</button>`).join('');
            tabsHTML += `<button class="tab-button text-lg mx-4 py-2 font-bold text-text-light border-b-4 border-transparent transition-colors flex items-center" data-day="favoritos">Mi Horario <span id="fav-count" class="ml-2 bg-primary text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">${this.favorites.length}</span></button>`;
            this.elements.programTabs.innerHTML = tabsHTML;
            this.elements.favCount = document.getElementById('fav-count');
        },

        renderFavorites() {
            this.elements.programContent.classList.add('hidden');
            this.elements.favoritesView.classList.remove('hidden');
            this.elements.favoritesView.innerHTML = `<h2 class="text-4xl md:text-5xl font-black text-text-dark text-center mb-12">Mi Horario</h2>`;
            const favoritePonencias = this.fullSchedule.filter(p => this.favorites.includes(p.id));
            const grid = document.createElement('div');
            grid.className = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8';
            if (favoritePonencias.length > 0) {
                grid.innerHTML = favoritePonencias.map(this.renderCard).join('');
            } else {
                grid.innerHTML = '<p class="col-span-full text-center text-text-light">Aún no has guardado ninguna ponencia.</p>';
            }
            this.elements.favoritesView.appendChild(grid);
            this.setupScrollAnimations();
        },

        // --- MANEJO DE EVENTOS Y ESTADO ---
        setupControls() {
            const debouncedRender = this.debounce(() => this.render(), 300);
            this.elements.searchInput.addEventListener('input', e => {
                this.currentFilters.search = e.target.value;
                debouncedRender();
            });
            ['type', 'sala', 'horario'].forEach(type => {
                this.elements[`filter${type.charAt(0).toUpperCase() + type.slice(1)}`].addEventListener('change', e => {
                    this.currentFilters[type] = e.target.value;
                    this.render();
                });
            });
            this.elements.resetBtn.addEventListener('click', () => {
                this.currentFilters = { search: '', type: 'all', sala: 'all', horario: 'all' };
                this.elements.searchInput.value = '';
                ['type', 'sala', 'horario'].forEach(type => this.elements[`filter${type.charAt(0).toUpperCase() + type.slice(1)}`].value = 'all');
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
                const isActive = btn.dataset.day === day;
                btn.classList.toggle('text-primary', isActive);
                btn.classList.toggle('border-primary', isActive);
                btn.classList.toggle('text-text-light', !isActive);
                btn.classList.toggle('border-transparent', !isActive);
            });
        },
        
        loadFavorites() {
            this.favorites = JSON.parse(localStorage.getItem('alaeitsFavorites_v2') || '[]');
        },
        
        saveFavorites() {
            localStorage.setItem('alaeitsFavorites_v2', JSON.stringify(this.favorites));
            if(this.elements.favCount) {
                this.elements.favCount.textContent = this.favorites.length;
            }
        },

        toggleFavorite(event, id) {
            event.stopPropagation();
            const buttonSVG = event.currentTarget.querySelector('svg');
            if (this.favorites.includes(id)) {
                this.favorites = this.favorites.filter(favId => favId !== id);
                buttonSVG.classList.remove('favorited');
            } else {
                this.favorites.push(id);
                buttonSVG.classList.add('favorited');
            }
            this.saveFavorites();
            if (this.currentDay === 'favoritos') {
                this.render();
            }
        },

        // --- HELPERS Y UTILIDADES ---
        setupScrollAnimations() {
            const animatedElements = document.querySelectorAll('[data-animate]:not(.is-visible)');
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });
            animatedElements.forEach(el => observer.observe(el));
        },
        
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