document.addEventListener('DOMContentLoaded', function() {

    // --- ELEMENTOS ---
    const modal = document.getElementById('details-modal');
    const modalBody = document.getElementById('modal-body');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    // --- CONFIGURACIÓN Y ESTADO ---
    const App = {
        masterScheduleURL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTeiEquNfK-SqUuAjFui6V6oIOiZPt4rA71hLATqU1h_8HlseDHuBpjW4sm3b0Q5APziFZ7wk9PQG5E/pub?output=csv",
        fullScheduleData: [],
        diasConfig: {
            'lunes 13 de octubre': { 
                nombreVisible: 'Lunes 13',
                tipo: 'especial', 
                eventos: [ 
                    { horario: '08:00', titulo: 'Inscripción y Acreditación', lugar: 'Museo de la Memoria (Matucana 501)' },
                    { horario: '10:00 – 12:30', titulo: 'Acto Inaugural', lugar: 'Museo de la Memoria' },
                    { horario: '12:30 – 15:00', titulo: 'Almuerzo libre' },
                    { horario: '15:00 – 17:50', titulo: 'Presentación Mesas (Apertura)', lugar: 'Universidad Central (Lord Cochrane 417, Santiago)' },
                    { horario: '17:00 – 19:00', titulo: 'Actividades Estudiantiles', lugar: 'Universidad de las Américas (República Nº71 – Aula Magna)' },
                    { horario: '18:00', titulo: 'Cierre del día y presentación del programa', lugar: 'Universidad Central' }
                ]
            },
            'martes 14 de octubre': { nombreVisible: 'Martes 14', tipo: 'grid' },
            'miércoles 15 de octubre': { nombreVisible: 'Miércoles 15', tipo: 'grid' }
        },

        // --- INICIALIZACIÓN ---
        init: async function() {
            this.setupScrollAnimations();
            this.attachModalListeners();
            try {
                const response = await fetch(this.masterScheduleURL);
                if (!response.ok) throw new Error('Error de red al cargar el programa.');
                const csvText = await response.text();
                this.fullScheduleData = this.parseCSV(csvText);
                this.renderTabs();
                this.renderProgram();
            } catch (error) {
                console.error('Fallo en la inicialización:', error);
                const programContent = document.getElementById('program-content');
                programContent.innerHTML = '<p class="loading-message">No se pudo cargar el programa. Intente recargar la página.</p>';
            }
        },

        // --- PARSEO DE DATOS ---
        parseCSV: function(text) {
            const lines = text.trim().replace(/\r/g, '').split('\n');
            if (lines.length < 2) return [];
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            return lines.slice(1).map(line => {
                const values = line.split(/,(?=(?:[^\"]*"[^\"]*")*[^\"]*$)/).map(v => v.trim().replace(/^"|"$/g, ''));
                const obj = {};
                headers.forEach((header, i) => { obj[header] = values[i] || ''; });
                return obj;
            }).filter(item => !(item.Titulo_Item || '').toLowerCase().includes('discusión grupal y cierre'));
        },

        // --- RENDERIZADO DEL PROGRAMA ---
        renderTabs: function() {
            const tabsContainer = document.getElementById('program-tabs');
            const dias = Object.keys(this.diasConfig);
            tabsContainer.innerHTML = dias.map((dia, index) => 
                `<button class="tab-button ${index === 0 ? 'active' : ''}" data-day="${dia}">${this.diasConfig[dia].nombreVisible}</button>`
            ).join('');
            
            tabsContainer.addEventListener('click', e => {
                if (!e.target.matches('.tab-button')) return;
                tabsContainer.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                this.renderProgram();
            });
        },

        renderProgram: function() {
            const activeTab = document.querySelector('.tab-button.active');
            if (!activeTab) return;

            const dayKey = activeTab.dataset.day;
            const dayConfig = this.diasConfig[dayKey];
            const programContent = document.getElementById('program-content');
            let html = `<div class="day-content active" id="content-${dayKey.replace(/\s+/g, '-')}">`;

            if (dayConfig.tipo === 'especial') {
                const timeBlocks = [...new Set(dayConfig.eventos.map(item => item.horario))].sort();
                if (timeBlocks.length === 0) {
                    html += '<p class="loading-message">No hay eventos programados para este día.</p>';
                } else {
                    timeBlocks.forEach(bloque => {
                        html += `<div class="time-block">
                                    <h3 class="time-block-header">${bloque}</h3>
                                    <div class="sessions-grid">`;
                        
                        const blockData = dayConfig.eventos.filter(item => item.horario === bloque);

                        blockData.forEach(evento => {
                            html += this.createSpecialEventHTML(evento);
                        });

                        html += `</div></div>`;
                    });
                }
            } else {
                const dayData = this.fullScheduleData.filter(item => (item.Dia || '').trim().toLowerCase() === dayKey.toLowerCase());
                const timeBlocks = [...new Set(dayData.map(item => item.Horario_Bloque))].sort();

                if (timeBlocks.length === 0) {
                    html += '<p class="loading-message">No hay eventos programados para este día.</p>';
                } else {
                    timeBlocks.forEach(bloque => {
                        html += `<div class="time-block">
                                    <h3 class="time-block-header">${bloque}</h3>
                                    <div class="sessions-grid">`;
                        
                        const blockData = dayData.filter(item => item.Horario_Bloque === bloque);
                        const mesas = this.reconstructSchedule(blockData);

                        mesas.forEach(mesa => {
                            html += this.createSessionCardHTML(mesa);
                        });

                        html += `</div></div>`;
                    });
                }
            }

            html += `</div>`;
            programContent.innerHTML = html;
        },

        reconstructSchedule: function(data) {
            const mesas = {};
            data.forEach(row => {
                if (!row.ID_Mesa) return;
                const mesaId = row.ID_Mesa;
                if (!mesas[mesaId]) {
                    mesas[mesaId] = {
                        id: mesaId,
                        titulo: row.Titulo_Mesa,
                        sala: row.Sala,
                        esSimposio: (row.Tipo_Item || '').toLowerCase().includes('simposio'),
                        items: []
                    };
                }
                mesas[mesaId].items.push(row);
            });
            return Object.values(mesas);
        },

        createSessionCardHTML: function(mesa) {
            const cardTypeClass = mesa.esSimposio ? 'is-simposio' : 'is-ponencia';
            const ponenciasHtml = mesa.items.map(item => {
                return `<div class="card-authors"><strong>${item.Titulo_Item}</strong> (ID: ${item.ID_Item})<br>${item.Autores_Item.split(';').join(', ')}</div>`;
            }).join('');

            return `
                <div class="program-card ${cardTypeClass}" data-mesa-id="${mesa.id}">
                    <h4 class="card-title">${mesa.titulo}</h4>
                    ${ponenciasHtml}
                    <div class="card-meta">
                        <span>Sala: ${mesa.sala}</span>
                        <span>ID Mesa: ${mesa.id}</span>
                    </div>
                </div>`;
        },

        createSpecialEventHTML: function(evento) {
            return `
                <div class="program-card is-ponencia">
                    <h4 class="card-title">${evento.titulo}</h4>
                    <div class="card-authors">${evento.lugar}</div>
                    <div class="card-meta">
                        <span>Horario: ${evento.horario}</span>
                    </div>
                </div>`;
        },

        // --- MODAL ---
        attachModalListeners: function() {
            const programContent = document.getElementById('program-content');
            programContent.addEventListener('click', e => {
                const card = e.target.closest('.program-card');
                if (!card) return;

                const mesaId = card.dataset.mesaId;
                const dayKey = document.querySelector('.tab-button.active').dataset.day;
                const dayData = this.fullScheduleData.filter(item => (item.Dia || '').trim().toLowerCase() === dayKey.toLowerCase());
                const blockData = dayData.filter(item => item.ID_Mesa === mesaId);
                const mesa = this.reconstructSchedule(blockData)[0];

                if (mesa) {
                    this.openModal(mesa);
                }
            });

            modalCloseBtn.addEventListener('click', () => this.closeModal());
            modal.addEventListener('click', e => {
                if (e.target === modal) this.closeModal();
            });
        },

        openModal: function(mesa) {
            let modalHTML = `<h3>${mesa.titulo}</h3>`;
            mesa.items.forEach(item => {
                modalHTML += `<p><strong>Ponencia:</strong> ${item.Titulo_Item || 'N/A'}</p>
                             <p><strong>ID de Trabajo:</strong> ${item.ID_Item}</p>
                             <p><strong>Autores:</strong><br>${(item.Autores_Item || '').split(';').join('<br>')}</p><br>`;
            });
            modalHTML += `<div class="meta-info">
                            <span>Sala: ${mesa.sala}</span>
                            <span>ID Mesa: ${mesa.id}</span>
                        </div>`;
            
            modalBody.innerHTML = modalHTML;
            modal.classList.add('active');
        },

        closeModal: function() {
            modal.classList.remove('active');
        },

        // --- ANIMACIONES DE SCROLL ---
        setupScrollAnimations: function() {
            const animatedElements = document.querySelectorAll('[data-animate]');
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });
            animatedElements.forEach(el => observer.observe(el));
        }
    };

    App.init();
});