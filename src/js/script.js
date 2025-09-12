/**
 * @file ALAEITS 2025 - Lógica del Programa Interactivo
 */
document.addEventListener('DOMContentLoaded', () => {

const App = {
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
    LOCAL_STORAGE_KEY: 'alaeitsFavorites_v4',

    init() {
        this.cacheElements();
        this.setupControls();
        this.fetchAndProcessData();
        this.setupScrollListener();
    },
    
    cacheElements() {
        this.elements = {
            header: document.querySelector('.main-header'),
            programContent: document.getElementById('program-content'),
            favoritesView: document.getElementById('favorites-view'),
            programTabs: document.getElementById('program-tabs'),
            noResults: document.getElementById('no-results'),
            searchInput: document.getElementById('program-search-input'),
            filterType: document.getElementById('filter-type'),
            filterSala: document.getElementById('filter-sala'),
            filterHorario: document.getElementById('filter-horario'),
            resetBtn: document.getElementById('reset-filters'),
            clearFiltersNoResultsBtn: document.getElementById('clear-filters-no-results'),
            toastContainer: document.getElementById('toast-container'),
        };
    },

            async fetchAndProcessData() {
        try {
            this.loadFavorites();
            const response = await fetch(`${this.masterScheduleURL}&timestamp=${new Date().getTime()}`);
            if (!response.ok) throw new Error("No se pudo cargar el programa. Verifique el enlace del CSV.");
            
            const buffer = await response.arrayBuffer();
            const decoder = new TextDecoder('utf-8');
            const csvText = decoder.decode(buffer);

            this.fullSchedule = this.processData(this.parseCSV(csvText));
            
            console.log(`Cargadas ${this.fullSchedule.length} ponencias`);
            console.log('Primeras 3 ponencias:', this.fullSchedule.slice(0, 3));
            
            this.populateFilters();
            this.renderTabs();
            this.applyStateFromURL();
        } catch (error) {
            console.error('Error completo:', error);
            this.elements.programContent.innerHTML = `<p class="col-span-full text-center">${error.message}</p>`;
        }
    },
    
        parseCSV(text) {
        const lines = text.trim().split('\n');
        const headers = this.parseCSVLine(lines[0]);
        
        console.log('Headers encontrados:', headers);
        
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            
            const values = this.parseCSVLine(lines[i]);
            if (values.length === 0) continue;
            
            const row = {};
            headers.forEach((header, index) => {
                const cleanHeader = header.trim().replace(/"/g, '');
                if (cleanHeader) {
                    row[cleanHeader] = (values[index] || '').trim().replace(/^"|"$/g, '');
                }
            });
            
            if (row.ID_Mesa && row.Titulo_Item) {
                rows.push(row);
            }
        }
        
        console.log(`Filas parseadas: ${rows.length}`);
        return rows;
    },

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result;
    },

    processData(data) {
    const mesas = {};
    data.forEach(row => {
        if (!row.ID_Mesa || !row.Titulo_Item) return;

        const diaLimpio = String(row.Dia).replace(/\u00A0/g, ' ').trim().toLowerCase();

        if (!mesas[row.ID_Mesa]) {
            mesas[row.ID_Mesa] = {
                id: (row.ID_Mesa || '').trim(),
                dia: diaLimpio,
                horario: (row.Horario_Bloque || '').trim(),
                sala: (row.Sala || '').trim(),
                titulo: (row.Titulo_Mesa || '').trim(),
                esSimposio: row.Tipo_Item === 'Simposio',
                eje: (row.Titulo_Mesa.match(/^(EJE \d+):/) || [null, null])[1],
                items: []
            };
        }
        mesas[row.ID_Mesa].items.push({
            id: (row.ID_Item || '').trim(),
            titulo: (row.Titulo_Item || '').trim(),
            autores: (row.Autores_Item || '').split(',').map(a => a.trim().replace(/^"|"$/g, '')).filter(Boolean)
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

        async render() {
        this.elements.programContent.classList.add('loading');
        await new Promise(res => setTimeout(res, 150));
        
        this.elements.favoritesView.classList.add('hidden');
        this.elements.programContent.classList.remove('hidden');
        
        if (this.currentDay === 'favoritos') {
            this.renderFavorites();
            return;
        }
        
        const filteredData = this.fullSchedule.filter(p => this.filterPonencia(p));
        this.elements.programContent.innerHTML = filteredData.length > 0 ? filteredData.map(p => this.renderCard(p)).join('') : '';
        
        const hasFilters = this.currentFilters.search !== '' || 
                        this.currentFilters.type !== 'all' || 
                        this.currentFilters.sala !== 'all' || 
                        this.currentFilters.horario !== 'all';
        
        this.elements.noResults.classList.toggle('hidden', filteredData.length > 0);
        
        if (hasFilters && filteredData.length > 0) {
            console.log(`Se encontraron ${filteredData.length} resultados`);
        }
        
        this.elements.programContent.classList.remove('loading');
    },
        
        renderCard(ponencia) {
            const isFavorited = this.favorites.includes(ponencia.id);
            const typeClass = ponencia.esSimposio ? 'is-simposio' : 'is-ponencia';
            
            const diaVisible = (this.diasConfig[ponencia.dia]?.nombreVisible || ponencia.dia) || '--';
            const horarioVisible = ponencia.horario || '--';
            const salaVisible = ponencia.sala ? `SALA ${ponencia.sala}` : '--';
            
            const moderadorName = ponencia.autores?.[0] || 'N/A';
            const searchQuery = this.currentFilters.search;
            const titulo = searchQuery ? this.highlightText(ponencia.titulo, searchQuery) : ponencia.titulo;
            const autores = searchQuery ? this.highlightText(ponencia.autores.join(', '), searchQuery) : ponencia.autores.join(', ');

            return `
            <div class="program-card ${typeClass}">
                <div class="card-content">
                    <button class="favorite-btn" onclick="App.toggleFavorite(event, '${ponencia.id}')">
                        <svg class="${isFavorited ? 'favorited' : ''}" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                    </button>
                    <button class="share-btn" onclick="App.sharePonencia('${ponencia.id}')" title="Copiar enlace a esta ponencia">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 4.186 2.25 2.25 0 000-4.186zM14.333 4.427a2.25 2.25 0 100 4.186 2.25 2.25 0 000-4.186zM6.35 15.345a2.25 2.25 0 100 4.186 2.25 2.25 0 000-4.186zM15.75 12a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z" /></svg>
                    </button>
                    <div class="card-header">MESA: ${ponencia.mesaId} / ID: ${ponencia.id}</div>
                    <h3 class="card-title">${titulo}</h3>
                    <p class="card-moderator"><span class="font-bold">Modera:</span> ${moderadorName}</p>
                    <p class="card-authors">${autores}</p>
                    ${ponencia.eje ? `<div class="card-eje">${ponencia.eje}</div>` : ''}
                </div>
                <div class="card-footer">
                    <span>${horarioVisible}</span>
                    <span>${diaVisible}</span>
                    <span>${salaVisible}</span>
                </div>
            </div>`;
        },
        
        populateFilters() {
            const salas = [...new Set(this.fullSchedule.map(p => p.sala).filter(Boolean))].sort((a,b) => parseInt(a) - parseInt(b));
            const horarios = [...new Set(this.fullSchedule.map(p => p.horario).filter(Boolean))].sort();
            this.elements.filterSala.innerHTML = '<option value="all">Todas las Salas</option>' + salas.map(s => `<option value="${s}">Sala ${s}</option>`).join('');
            this.elements.filterHorario.innerHTML = '<option value="all">Todos los Horarios</option>' + horarios.map(h => `<option value="${h}">${h}</option>`).join('');
            this.elements.filterType.innerHTML = '<option value="all">Todo Tipo</option><option value="simposio">Simposios</option><option value="ponencia">Ponencias</option>';
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
                grid.innerHTML = favoritePonencias.map(this.renderCard.bind(this)).join('');
            } else {
                grid.innerHTML = '<p class="col-span-full text-center text-text-light">Aún no has guardado ninguna ponencia.</p>';
            }
            this.elements.favoritesView.appendChild(grid);
            this.elements.programContent.classList.remove('loading');
        },

        setupControls() {
            const debouncedRender = this.debounce(() => { this.render(); this.updateURL(); }, 350);
            
            this.elements.searchInput.addEventListener('input', e => {
                this.currentFilters.search = e.target.value;
                debouncedRender();
            });
            
            ['Type', 'Sala', 'Horario'].forEach(type => {
                this.elements[`filter${type}`].addEventListener('change', e => {
                    this.currentFilters[type.toLowerCase()] = e.target.value;
                    this.render();
                    this.updateURL();
                });
            });

            const resetAndRender = () => {
                this.currentFilters = { search: '', type: 'all', sala: 'all', horario: 'all' };
                this.elements.searchInput.value = '';
                ['Type', 'Sala', 'Horario'].forEach(type => this.elements[`filter${type}`].selectedIndex = 0);
                this.render();
                this.updateURL();
            };

            this.elements.resetBtn.addEventListener('click', resetAndRender);
            this.elements.clearFiltersNoResultsBtn.addEventListener('click', resetAndRender);

            this.elements.programTabs.addEventListener('click', e => {
                const button = e.target.closest('.tab-button');
                if (button) {
                    this.currentDay = button.dataset.day;
                    this.setActiveTab(this.currentDay);
                    this.render();
                    this.updateURL();
                }
            });
        },

        setActiveTab(day) {
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.toggle('active', btn.dataset.day === day));
        },
        
        loadFavorites() {
            this.favorites = JSON.parse(localStorage.getItem(this.LOCAL_STORAGE_KEY) || '[]');
        },
        
        saveFavorites() {
            localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(this.favorites));
            if (this.elements.favCount) this.elements.favCount.textContent = this.favorites.length;
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
            if (this.currentDay === 'favoritos') this.render();
        },

        filterPonencia(p) {
            const search = this.currentFilters.search.toLowerCase();
            const hasActiveSearch = search !== '';

            if (this.currentDay !== 'favoritos') {
                const diaPonenciaLimpio = String(p.dia).replace(/\u00A0/g, ' ').trim().toLowerCase();
                const diaPestanaLimpio = String(this.currentDay).replace(/\u00A0/g, ' ').trim().toLowerCase();
                
                if (diaPonenciaLimpio !== diaPestanaLimpio) {
                    return false;
                }
            }

            if (hasActiveSearch) {
                const matchesSearch = (
                    p.titulo.toLowerCase().includes(search) ||
                    (p.id && p.id.toLowerCase().includes(search)) ||
                    p.autores.join(' ').toLowerCase().includes(search) ||
                    p.mesaTitulo.toLowerCase().includes(search)
                );
                
                if (!matchesSearch) {
                    return false;
                }
            }

            // Aplicar el resto de filtros
            const matchType = this.currentFilters.type === 'all' || (this.currentFilters.type === 'simposio' ? p.esSimposio : !p.esSimposio);
            const matchSala = this.currentFilters.sala === 'all' || p.sala === this.currentFilters.sala;
            const matchHorario = this.currentFilters.horario === 'all' || p.horario === this.currentFilters.horario;

            return matchType && matchSala && matchHorario;
        },

        highlightText(text, query) {
            if (!query) return text;
            const regex = new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
            return text.replace(regex, '<mark>$1</mark>');
        },

        sharePonencia(id) {
            const url = new URL(window.location);
            const params = new URLSearchParams();
            const ponencia = this.fullSchedule.find(p => p.id === id);
            if(ponencia) params.set('dia', ponencia.dia);
            params.set('ponencia', id);
            url.hash = params.toString();

            navigator.clipboard.writeText(url.href)
                .then(() => this.showToast('¡Enlace copiado al portapapeles!'))
                .catch(() => this.showToast('Error al copiar el enlace.'));
        },

        showToast(message) {
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;
            this.elements.toastContainer.appendChild(toast);
            setTimeout(() => {
                toast.classList.add('out');
                toast.addEventListener('animationend', () => toast.remove());
            }, 3000);
        },

        updateURL() {
            const params = new URLSearchParams();
            if (this.currentDay) params.set('dia', this.currentDay);
            Object.entries(this.currentFilters).forEach(([key, value]) => {
                if (value && value !== 'all' && value !== '') params.set(key, value);
            });
            history.replaceState(null, '', `#${params.toString()}`);
        },

        applyStateFromURL() {
            const params = new URLSearchParams(window.location.hash.substring(1));
            const diaParam = params.get('dia');
            const ponenciaId = params.get('ponencia');
            let targetDay = diaParam;
            if(ponenciaId && !diaParam) {
                const targetPonencia = this.fullSchedule.find(p => p.id === ponenciaId);
                if(targetPonencia) targetDay = targetPonencia.dia;
            }
            this.currentDay = (targetDay && (this.diasConfig[targetDay] || targetDay === 'favoritos')) ? targetDay : Object.keys(this.diasConfig)[0];
            this.currentFilters = {
                search: params.get('search') || '', type: params.get('type') || 'all',
                sala: params.get('sala') || 'all', horario: params.get('horario') || 'all',
            };
            this.elements.searchInput.value = this.currentFilters.search;
            this.elements.filterType.value = this.currentFilters.type;
            this.elements.filterSala.value = this.currentFilters.sala;
            this.elements.filterHorario.value = this.currentFilters.horario;
            this.setActiveTab(this.currentDay);
            this.render();
            if(ponenciaId) {
                setTimeout(() => {
                    const cardHeader = Array.from(document.querySelectorAll('.card-header')).find(el => el.textContent.includes(ponenciaId));
                    const card = cardHeader?.closest('.program-card');
                    if(card) {
                        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        card.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease, outline 0.3s ease';
                        card.style.outline = '3px solid var(--color-favorite)';
                        setTimeout(() => card.style.outline = 'none', 2500);
                    }
                }, 500);
            }
        },

        setupScrollListener() {
            window.addEventListener('scroll', () => {
                this.elements.header.classList.toggle('scrolled', window.scrollY > 50);
            });
        },

        debounce(func, delay) {
            let timeoutId;
            return (...args) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => { func.apply(this, args); }, delay);
            };
        }
    };

    window.App = App;
    App.init();
});