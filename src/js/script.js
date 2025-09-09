const CONFIG = {
    numSalas: 26, salaReservaNombre: "Auditorio de Reserva (Sala 26)", duracionPonenciaMin: 12,
    dias: [ { nombre: 'Lunes 13 de octubre', tipo: 'especial', eventos: [ { horario: '08:00', titulo: 'Inscripción y Acreditación', lugar: 'Museo de la Memoria (Matucana 501)' }, { horario: '10:00 – 12:30', titulo: 'Acto Inaugural', lugar: 'Museo de la Memoria' }, { horario: '12:30 – 15:00', titulo: 'Almuerzo libre' }, { horario: '15:00 – 17:50', titulo: 'Presentación Mesas (Apertura)', lugar: 'Universidad Central (Lord Cochrane 417, Santiago)' }, { horario: '17:00 – 19:00', titulo: 'Actividades Estudiantiles', lugar: 'Universidad de las Américas (República Nº71 – Aula Magna)' }, { horario: '18:00', titulo: 'Cierre del día y presentación del programa', lugar: 'Universidad Central' }, ] }, { nombre: 'Martes 14 de octubre', tipo: 'grid', bloques: [ { inicio: '08:30', fin: '10:10', nombre: 'Mesa 1' }, { inicio: '10:20', fin: '12:00', nombre: 'Mesa 2' }, { inicio: '12:10', fin: '13:50', nombre: 'Mesa 3' }, { inicio: '15:00', fin: '16:40', nombre: 'Mesa 4' }, { inicio: '16:50', fin: '18:30', nombre: 'Mesa 5' }, ] }, { nombre: 'Miércoles 15 de octubre', tipo: 'grid', bloques: [ { inicio: '08:30', fin: '10:10', nombre: 'Mesa 6' }, { inicio: '10:20', fin: '12:00', nombre: 'Mesa 7' }, { inicio: '12:10', fin: '13:50', nombre: 'Mesa 8' }, { inicio: '14:00', fin: '15:30', nombre: 'Mesa 9' }, ] }, ],
    iconos: { 
        reloj: `<svg viewBox="0 0 24 24"><path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"></path><path d="M13 7h-2v6h6v-2h-4z"></path></svg>`, 
        id: `<svg viewBox="0 0 24 24"><path d="M10 11h4v2h-4z"></path><path d="M10 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-8l-2-2z"></path></svg>`, 
        sala: `<svg viewBox="0 0 24 24"><path d="M12 6.5A2.5 2.5 0 0 1 14.5 9a2.5 2.5 0 0 1-2.5 2.5A2.5 2.5 0 0 1 9.5 9A2.5 2.5 0 0 1 12 6.5M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7m0 2a5 5 0 0 0-5 5c0 1.96 1.41 5.21 5 9.78 3.59-4.57 5-7.82 5-9.78a5 5 0 0 0-5-5Z"/></svg>`,
        camara: `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M9 4V2.5A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5V4h1.5A3.5 3.5 0 0 1 20 7.5v9A3.5 3.5 0 0 1 16.5 20h-9A3.5 3.5 0 0 1 4 16.5v-9A3.5 3.5 0 0 1 7.5 4H9Zm3 14a5 5 0 1 0 0-10a5 5 0 0 0 0 10Zm0-2a3 3 0 1 1 0-6a3 3 0 0 1 0 6Z"></path></svg>`
    }
};
const masterScheduleURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTeiEquNfK-SqUuAjFui6V6oIOiZPt4rA71hLATqU1h_8HlseDHuBpjW4sm3b0Q5APziFZ7wk9PQG5E/pub?output=csv";
let fullSchedule = [];
let currentFilters = { type: 'all', sala: 'all', horario: 'all' };
let currentDay = CONFIG.dias[0].nombre;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch(`${masterScheduleURL}&timestamp=${new Date().getTime()}`);
        if (!response.ok) throw new Error("No se pudo cargar el programa. Verifique el enlace.");
        const tableData = parseCSV(await response.text());
        fullSchedule = reconstructScheduleFromTable(tableData);
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('schedule-wrapper').style.display = 'block';
        setupControls();
        applyFiltersFromURL();
        switchTab(currentDay);
    } catch (error) { console.error('Error al iniciar:', error); document.getElementById('loading-state').innerText = `Error: ${error.message}`; }
});

function parseCSV(text) { const lines = text.trim().replace(/\r/g, '').split('\n'); if (lines.length < 2) return []; const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '')); return lines.slice(1).map(line => { if (!line) return null; const values = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, '')); return headers.reduce((obj, header, index) => ({ ...obj, [header]: values[index] || '' }), {}); }).filter(Boolean); }

function reconstructScheduleFromTable(tableData) {
    const mesas = {};
    tableData.forEach(row => {
        if (!row.ID_Mesa) return;
        const mesaId = row.ID_Mesa;
        if (!mesas[mesaId]) {
            mesas[mesaId] = { id: mesaId, dia: row.Dia.trim(), horarioBloque: row.Horario_Bloque, sala: row.Sala, titulo: row.Titulo_Mesa, esSimposio: row.Tipo_Item === 'Simposio', items: [] };
        }
        const autores = row.Autores_Item.split(';').map(a => a.trim()).filter(Boolean);
        mesas[mesaId].items.push({ id: row.ID_Item, titulo: row.Titulo_Item, autores: autores, tipo: row.Tipo_Item, moderador: autores[0] || '' });
    });
    Object.values(mesas).forEach(mesa => {
        if (!mesa.esSimposio) {
            let horaActual = mesa.horarioBloque.split(' - ')[0];
            mesa.items.forEach(item => {
                if (item.id !== 'DISC') {
                    const horaFin = addMinutes(horaActual, CONFIG.duracionPonenciaMin);
                    item.horario = `${horaActual} - ${horaFin}`;
                    horaActual = horaFin;
                }
            });
        }
    });
    return Object.values(mesas);
}

function renderSessionCard(mesa) {
    const cardClass = mesa.esSimposio ? 'simposio-card' : 'ponencia-card';
    const cardHeader = mesa.esSimposio ? 'Simposio' : 'Mesa de Ponencias';
    const idDisplay = mesa.esSimposio ? `ID Simposio: ${mesa.items[0].id}` : `ID Mesa: ${mesa.id}`;
    const salaNombre = mesa.sala == 26 ? CONFIG.salaReservaNombre : `Sala ${mesa.sala}`;
    const safeFileName = `${cardHeader.replace(/ /g, '_')}_${mesa.id}`;

    return `<div class="session-card ${cardClass}" id="card-${mesa.id}">
        <div class="card-header">
            <div class="card-header-title">${cardHeader}</div>
            <button class="capture-btn" title="Exportar como Imagen" onclick="captureCard('card-${mesa.id}', '${safeFileName}')">
                ${CONFIG.iconos.camara}
            </button>
        </div>
        <div class="card-meta">
            <div class="meta-item mobile-only-header"><strong>${salaNombre}</strong></div>
            <div class="meta-item">${CONFIG.iconos.reloj}<span>${mesa.horarioBloque}</span></div>
            <div class="meta-item">${CONFIG.iconos.sala}<span>${salaNombre}</span></div>
            <div class="meta-item">${CONFIG.iconos.id}<span>${idDisplay}</span></div>
        </div>
        <div class="card-content">
            <div class="mesa-title">${mesa.titulo}</div>
            <ul class="ponencia-list">
                ${mesa.items.map(item => `<li class="ponencia-item" id="item-${item.id}">
                    ${!mesa.esSimposio && item.id !== 'DISC' ? `<div class="ponencia-meta">${item.horario} | ID: ${item.id}</div>` : ''}
                    <div class="ponencia-title">${item.titulo}</div>
                    <div class="ponencia-authors">${item.autores.join(', ')}</div>
                    ${item.moderador ? `<div class="ponencia-moderador">Moderador: ${item.moderador}</div>` : ''}
                </li>`).join('')}
            </ul>
        </div>
    </div>`;
}

function captureCard(elementId, fileName = 'programa-seminario') {
    const elementToCapture = document.getElementById(elementId);
    if (!elementToCapture) {
        console.error('Elemento no encontrado para capturar:', elementId);
        showStatus('Error: No se pudo encontrar la tarjeta para exportar.', 'error');
        return;
    }

    showStatus('Exportando imagen, por favor espera...', 'success');

    const computedStyles = getComputedStyle(elementToCapture);
    const resolvedBgColor = computedStyles.getPropertyValue('--color-surface').trim();
    
    html2canvas(elementToCapture, {
        scale: 2,
        useCORS: true,
        backgroundColor: resolvedBgColor || '#ffffff', 
        onclone: (document, element) => {
            element.style.boxShadow = 'none';
            element.style.transform = 'none';
        }
    }).then(canvas => {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${fileName}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showStatus('¡Imagen exportada con éxito!', 'success');
    }).catch(err => {
        console.error('Error al usar html2canvas:', err);
        showStatus('Ocurrió un error al exportar la imagen.', 'error');
    });
}

function setupControls() {
    const tabContainer = document.getElementById('tab-container');
    tabContainer.innerHTML = CONFIG.dias.map(dia => `<button class="tab-button" data-day="${dia.nombre}">${dia.nombre}</button>`).join('');
    tabContainer.addEventListener('click', e => { if (e.target.classList.contains('tab-button')) switchTab(e.target.dataset.day); });
    const salaSelect = document.getElementById('filter-sala');
    salaSelect.innerHTML = `<option value="all">Todas las Salas</option>` + Array.from({ length: 25 }, (_, i) => `<option value="${i + 1}">Sala ${i + 1}</option>`).join('') + `<option value="26">${CONFIG.salaReservaNombre}</option>`;
    
    const searchInput = document.getElementById('searchId');
    const clearSearchInlineBtn = document.getElementById('clear-search-inline-btn');

    searchInput.addEventListener('keyup', e => {
        if (e.key === 'Enter') buscar();
        toggleClearSearchButton(); // Mostrar/ocultar el botón de borrado inline
    });
    searchInput.addEventListener('input', toggleClearSearchButton); // También para cambios no de teclado

    clearSearchInlineBtn.addEventListener('click', () => {
        limpiarBusqueda();
        searchInput.focus(); // Mantener el foco en el input después de limpiar
    });
    
    function toggleClearSearchButton() {
        if (searchInput.value.trim() !== '') {
            clearSearchInlineBtn.classList.add('visible');
        } else {
            clearSearchInlineBtn.classList.remove('visible');
        }
    }

    salaSelect.addEventListener('change', e => { currentFilters.sala = e.target.value; applyFiltersAndRender(); });
    document.getElementById('filter-horario').addEventListener('change', e => { currentFilters.horario = e.target.value; applyFiltersAndRender(); });
    document.getElementById('filter-type').addEventListener('click', e => { if (e.target.tagName === 'BUTTON') { currentFilters.type = e.target.dataset.type; document.querySelectorAll('#filter-type button').forEach(btn => btn.classList.remove('active')); e.target.classList.add('active'); applyFiltersAndRender(); } });
    document.getElementById('reset-filters').addEventListener('click', resetFiltersAndRender);
    document.querySelector('.search-controls .btn:last-of-type').addEventListener('click', limpiarBusqueda);
    document.getElementById('copy-link').addEventListener('click', copyLinkToView);
    updateProgramSummaryFooter();

    toggleClearSearchButton();
}

function buscar() {
    limpiarResaltado();
    const searchTerm = document.getElementById('searchId').value.trim().toLowerCase();
    if (!searchTerm) { showStatus('Por favor, ingresa un término para buscar.', 'error'); return; }
    let foundItem = null;
    for (const mesa of fullSchedule) {
        if (mesa.titulo.toLowerCase().includes(searchTerm)) { foundItem = { mesa, item: null }; break; }
        for (const item of mesa.items) { if (item.id?.toLowerCase().includes(searchTerm) || item.titulo?.toLowerCase().includes(searchTerm) || item.autores?.join(' ').toLowerCase().includes(searchTerm)) { foundItem = { mesa, item }; break; } }
        if (foundItem) break;
    }
    if (foundItem) {
        const { mesa, item } = foundItem;
        currentFilters.sala = String(mesa.sala).trim();
        currentFilters.horario = mesa.horarioBloque.trim();
        currentFilters.type = 'all';
        switchTab(mesa.dia);
        setTimeout(() => {
            const elementToHighlight = item ? document.getElementById(`item-${item.id}`) : document.getElementById(`card-${mesa.id}`);
            if (elementToHighlight) {
                elementToHighlight.classList.add('highlight');
                if (item) elementToHighlight.closest('.session-card')?.classList.add('highlight');
                elementToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
                showStatus(`Resultado encontrado para "${searchTerm}". Vista enfocada.`, 'success');
            }
        }, 150);
    } else {
        showStatus(`No se encontraron resultados para "${searchTerm}".`, 'error');
    }
}

function renderMobileList(mesas) {
  return `<div class="schedule-list">${mesas.map(renderSessionCard).join('')}</div>`;
}

function renderSpecialDay(dayConfig) {
    return `<div class="day-container">
        ${dayConfig.eventos.map(evento => `
            <div class="special-event">
                <div class="event-time">${evento.horario}</div>
                <div class="event-details">
                    <div class="event-title">${evento.titulo}</div>
                    <div class="event-location">${evento.lugar}</div>
                </div>
            </div>
        `).join('')}
    </div>`;
}

function switchTab(dayToShow) { const targetDayConfig = CONFIG.dias.find(d => d.nombre.toLowerCase() === dayToShow.toLowerCase().trim()); if (!targetDayConfig) { console.error("Intento de cambiar a un día inválido:", dayToShow); return; } currentDay = targetDayConfig.nombre; document.querySelectorAll('.tab-button').forEach(btn => btn.classList.toggle('active', btn.dataset.day === currentDay)); updateFilterControlsUI(targetDayConfig); applyFiltersAndRender(); }
function applyFiltersAndRender() { const dayConfig = CONFIG.dias.find(d => d.nombre === currentDay); const scheduleContent = document.getElementById('schedule-content'); if (dayConfig.tipo === 'grid') { const daySchedule = fullSchedule.filter(m => m.dia.toLowerCase() === dayConfig.nombre.toLowerCase()); const filteredMesas = daySchedule.filter(mesa => (currentFilters.type === 'all' || (currentFilters.type === 'simposio' ? mesa.esSimposio : !mesa.esSimposio)) && (currentFilters.sala === 'all' || String(mesa.sala).trim() === currentFilters.sala) && (currentFilters.horario === 'all' || mesa.horarioBloque.trim() === currentFilters.horario)); if (filteredMesas.length === 0) { scheduleContent.innerHTML = `<div class="no-results">No se encontraron sesiones con los filtros aplicados.</div>`; } else { scheduleContent.innerHTML = window.innerWidth >= 1024 ? renderDesktopGrid(dayConfig, filteredMesas) : renderMobileList(filteredMesas); } } else { scheduleContent.innerHTML = renderSpecialDay(dayConfig); } updateURLHash(); }
function renderDesktopGrid(dayConfig, mesas) { const salasToShow = currentFilters.sala === 'all' ? Array.from({ length: CONFIG.numSalas }, (_, i) => i + 1) : [parseInt(currentFilters.sala)]; const bloquesToShow = currentFilters.horario === 'all' ? dayConfig.bloques : dayConfig.bloques.filter(b => `${b.inicio} - ${b.fin}` === currentFilters.horario); let gridHTML = `<div class="schedule-grid" style="grid-template-columns: var(--sala-header-width) repeat(${bloquesToShow.length}, minmax(380px, 1fr));"><div class="time-header-wrapper"></div>${bloquesToShow.map(b => `<div class="time-header-wrapper"><div class="time-header"><div>${b.nombre}</div><div>${b.inicio} - ${b.fin}</div></div></div>`).join('')}`; salasToShow.forEach(salaNum => { const rowCells = bloquesToShow.map(b => { const mesa = mesas.find(m => String(m.sala).trim() === String(salaNum) && m.horarioBloque.trim() === `${b.inicio} - ${b.fin}`); return mesa ? renderSessionCard(mesa) : `<div class="empty-cell"></div>`; }); if (rowCells.some(cell => !cell.includes('empty-cell'))) { gridHTML += `<div class="sala-header">${salaNum === 26 ? CONFIG.salaReservaNombre : `Sala ${salaNum}`}</div>${rowCells.join('')}`; } }); return gridHTML + `</div>`; }
function resetFiltersAndRender() { resetFiltersState(); limpiarBusquedaInput(); applyFiltersAndRender(); showStatus('Filtros reiniciados. Vista completa restaurada.', 'success'); }
function limpiarBusqueda() { 
    const searchInput = document.getElementById('searchId');
    searchInput.value = ''; 
    const clearSearchInlineBtn = document.getElementById('clear-search-inline-btn');
    if (clearSearchInlineBtn) {
        clearSearchInlineBtn.classList.remove('visible');
    }
    limpiarResaltado(); 
    resetFiltersAndRender(); 
}
function resetFiltersState() { currentFilters = { type: 'all', sala: 'all', horario: 'all' }; }
function updateFilterControlsUI(dayConfig) { const enabled = dayConfig.tipo === 'grid'; ['filter-sala', 'filter-horario', 'filter-type', 'reset-filters', 'copy-link'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = enabled ? (el.tagName === 'SELECT' ? 'inline-block' : 'flex') : 'none'; }); const horarioSelect = document.getElementById('filter-horario'); if (enabled) { horarioSelect.innerHTML = `<option value="all">Todos los Horarios</option>` + dayConfig.bloques.map(b => `<option value="` + b.inicio + ` - ` + b.fin + `">` + b.inicio + ` - ` + b.fin + ` (` + b.nombre + `)</option>`).join(''); } else { horarioSelect.innerHTML = `<option value="all">No aplica</option>`; } document.getElementById('filter-sala').value = currentFilters.sala; document.getElementById('filter-horario').value = currentFilters.horario; document.querySelectorAll('#filter-type button').forEach(btn => btn.classList.remove('active')); document.querySelector(`#filter-type button[data-type="${currentFilters.type}"]`)?.classList.add('active'); }
function limpiarBusquedaInput() { document.getElementById('searchId').value = ''; }
function limpiarResaltado() { document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight')); }
function updateProgramSummaryFooter() { const { totalPonencias, totalSimposios } = fullSchedule.reduce((acc, mesa) => { if (mesa.esSimposio) acc.totalSimposios++; else acc.totalPonencias += mesa.items.filter(item => item.id !== 'DISC').length; return acc; }, { totalPonencias: 0, totalSimposios: 0 }); document.getElementById('program-summary-footer').innerHTML = `<h3>Resumen del Programa</h3><p>Total de Ponencias: <strong>${totalPonencias}</strong></p><p>Total de Simposios: <strong>${totalSimposios}</strong></p>`; }
function addMinutes(time, mins) { const [hours, minutes] = time.split(':').map(Number); const date = new Date(); date.setHours(hours, minutes + mins, 0, 0); return date.toTimeString().slice(0, 5); }
function showStatus(message, type = 'success') { const statusBar = document.getElementById('status-bar'); statusBar.textContent = message; statusBar.className = `status-${type}`; setTimeout(() => { statusBar.textContent = ''; statusBar.className = ''; }, 4000); }
function updateURLHash() { const params = new URLSearchParams(); params.set('dia', currentDay); Object.entries(currentFilters).forEach(([key, value]) => { if (value !== 'all') params.set(key, value); }); history.replaceState(null, '', '#' + params.toString()); }
function copyLinkToView() { navigator.clipboard.writeText(window.location.href).then(() => showStatus('¡Enlace a la vista actual copiado.', 'success')).catch(() => showStatus('No se pudo copiar el enlace.', 'error')); }
function applyFiltersFromURL() { if (!window.location.hash) return; const params = new URLSearchParams(window.location.hash.substring(1)); const day = params.get('dia'); if (day && CONFIG.dias.some(d => d.nombre === day)) currentDay = day; ['sala', 'horario', 'type'].forEach(key => { if (params.has(key)) { currentFilters[key] = params.get(key); } }); }