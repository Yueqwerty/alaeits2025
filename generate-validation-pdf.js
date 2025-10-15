const fs = require('fs');
const https = require('https');

// Simular window object y cargar el mapa de salas
const window = {};
eval(fs.readFileSync('src/js/detailed-room-map.js', 'utf-8'));

// Obtener datos del API
const url = 'https://alaeits2025.vercel.app/api/events-public';

https.get(url, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        const result = JSON.parse(body);
        const data = result.data || [];

        const miercoles = data.filter(e =>
            e.dia === 'miércoles 15 de octubre' &&
            parseInt(e.sala) >= 16 &&
            e.sala &&
            e.horario
        );

        generateHTML(miercoles);
    });
}).on('error', (err) => {
    console.error('Error fetching data:', err);
});

function generateHTML(miercoles) {

const grouped = {};
miercoles.forEach(e => {
    const key = `${e.sala}|${e.horario}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
});

let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Validación Salas - Miércoles 15</title>
    <style>
        @page { margin: 1.5cm; }
        body { font-family: Arial, sans-serif; font-size: 10pt; margin: 20px; }
        h1 { text-align: center; color: #C8102E; margin-bottom: 30px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; page-break-inside: avoid; }
        th, td { border: 1px solid #333; padding: 8px; text-align: left; }
        th { background: #f0f0f0; font-weight: bold; }
        .sala-header {
            background: #C8102E;
            color: white;
            padding: 10px;
            margin-top: 20px;
            font-size: 12pt;
            font-weight: bold;
            page-break-before: auto;
        }
        .titulo { font-size: 9pt; line-height: 1.3; }
    </style>
</head>
<body>
    <h1>Validación de Salas - Sede UTEM</h1>
    <h2 style="text-align:center; color:#666; font-weight:normal; margin-top:-15px;">Miércoles 15 de Octubre (Salas 16+)</h2>
`;

Object.keys(grouped)
    .sort((a, b) => parseInt(a.split('|')[0]) - parseInt(b.split('|')[0]))
    .forEach(key => {
        const [sala, horario] = key.split('|');
        const events = grouped[key].sort((a, b) => (a.turnOrder || 0) - (b.turnOrder || 0));

        // Obtener sala física
        const firstEvent = events[0];
        const dayMap = { 'martes 14 de octubre': '14/10', 'miércoles 15 de octubre': '15/10' };
        const mappedDay = dayMap[firstEvent.dia];
        const activeRoom = window.getActiveRoom(String(sala), mappedDay, horario);
        const salaFisica = activeRoom ? activeRoom.nombre : '';

        html += `
    <div class="sala-header">Sala ${sala} ${salaFisica ? `- ${salaFisica}` : ''} - ${horario}</div>
    <table>
        <thead>
            <tr>
                <th style="width:6%">Turno</th>
                <th style="width:8%">ID</th>
                <th style="width:56%">Título</th>
                <th style="width:30%">Autores</th>
            </tr>
        </thead>
        <tbody>
`;

        events.forEach(e => {
            const titulo = (e.titulo || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const autores = (e.autores || []).join(', ').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            html += `
            <tr>
                <td style="text-align:center">${(e.turnOrder || 0) + 1}</td>
                <td style="text-align:center; font-weight:bold; color:#C8102E;">${e.id || ''}</td>
                <td class="titulo">${titulo}</td>
                <td>${autores}</td>
            </tr>
`;
        });

        html += `
        </tbody>
    </table>
`;
    });

html += `
    <div style="text-align:center; margin-top:40px; color:#666; font-size:9pt;">
        <p>ALAEITS 2025 - Crisis civilizatoria, luchas contra hegemónicas y proyectos emancipatorios</p>
    </div>
</body>
</html>
`;

fs.writeFileSync('validacion_miercoles_salas16.html', html, 'utf-8');
console.log('✅ Archivo generado: validacion_miercoles_salas16.html');
console.log(`📊 Total de eventos: ${miercoles.length}`);
}
