require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Script para mover todos los simposios a sus salas correspondientes (22-32 con prefijo U-)
 *
 * Este script:
 * 1. Identifica todos los simposios en la base de datos
 * 2. Encuentra simposios que NO están en salas 22-32
 * 3. Los reasigna automáticamente a salas disponibles 22-32
 */

async function fixSimposiosRooms() {
  console.log('Iniciando corrección de ubicación de simposios...\n');

  try {
    // 1. Consultar todos los simposios
    const { rows: allSimposios } = await pool.query(`
      SELECT id, title, event_type, room, scheduled_day, scheduled_time_block, status
      FROM events
      WHERE event_type = 'simposio'
      ORDER BY id
    `);

    console.log(`Total de simposios encontrados: ${allSimposios.length}\n`);

    // 2. Identificar simposios en salas incorrectas (no están en 22-32)
    const simposiosEnSalasIncorrectas = allSimposios.filter(s => {
      const room = parseInt(s.room);
      return room && (room < 22 || room > 32);
    });

    const simposiosEnSalasCorrectas = allSimposios.filter(s => {
      const room = parseInt(s.room);
      return room && room >= 22 && room <= 32;
    });

    const simposiosSinSala = allSimposios.filter(s => !s.room);

    console.log(`Simposios en salas correctas (22-32): ${simposiosEnSalasCorrectas.length}`);
    console.log(`Simposios en salas incorrectas (<22 o >32): ${simposiosEnSalasIncorrectas.length}`);
    console.log(`Simposios sin sala asignada: ${simposiosSinSala.length}\n`);

    if (simposiosEnSalasIncorrectas.length === 0 && simposiosSinSala.length === 0) {
      console.log('¡Todos los simposios ya están en sus salas correctas!');
      return;
    }

    // 3. Mostrar detalles de simposios incorrectos
    console.log('Iniciando proceso de corrección para los simposios en salas incorrectas...\n');

    // 4. Reasignar simposios a salas 22-32
    console.log('Iniciando reasignación automática...\n');

    // Obtener ocupación actual de salas 22-32 por día y bloque
    const { rows: ocupacionSalas } = await pool.query(`
      SELECT room, scheduled_day, scheduled_time_block, COUNT(*) as eventos
      FROM events
      WHERE room::integer BETWEEN 22 AND 32
        AND scheduled_day IS NOT NULL
        AND scheduled_time_block IS NOT NULL
      GROUP BY room, scheduled_day, scheduled_time_block
    `);

    // Crear mapa de ocupación
    const ocupacionMap = {};
    ocupacionSalas.forEach(row => {
      const key = `${row.room}-${row.scheduled_day}-${row.scheduled_time_block}`;
      ocupacionMap[key] = parseInt(row.eventos);
    });

    // Función para encontrar sala disponible
    function encontrarSalaDisponible(dia, bloque) {
      // Buscar en salas 22-32
      for (let sala = 22; sala <= 32; sala++) {
        const key = `${sala}-${dia}-${bloque}`;
        const ocupacion = ocupacionMap[key] || 0;

        // Permitir hasta 6 eventos por sala (igual que las salas normales)
        if (ocupacion < 6) {
          // Marcar como ocupada para evitar sobrecargar
          ocupacionMap[key] = ocupacion + 1;
          return sala;
        }
      }
      return null; // No hay salas disponibles
    }

    let movidos = 0;
    let errores = 0;

    // Procesar simposios en salas incorrectas
    for (const simposio of simposiosEnSalasIncorrectas) {
      try {
        let nuevaSala;

        if (simposio.scheduled_day && simposio.scheduled_time_block) {
          // Simposio programado: encontrar sala disponible en el mismo día/bloque
          nuevaSala = encontrarSalaDisponible(simposio.scheduled_day, simposio.scheduled_time_block);

          if (!nuevaSala) {
            console.log(`  ID ${simposio.id}: No hay salas U- disponibles para ${simposio.scheduled_day} - ${simposio.scheduled_time_block}`);
            errores++;
            continue;
          }
        } else {
          // Simposio sin programar: asignar a sala 22 por defecto (se puede cambiar después)
          nuevaSala = 22;
        }

        // Actualizar en la base de datos
        await pool.query(`
          UPDATE events
          SET room = $1
          WHERE id = $2
        `, [nuevaSala, simposio.id]);

        console.log(`  ID ${simposio.id}: Movido de sala ${simposio.room} → ${nuevaSala}`);
        movidos++;

      } catch (error) {
        console.error(`Error moviendo ID ${simposio.id}:`, error.message);
        errores++;
      }
    }

    // Procesar simposios sin sala
    for (const simposio of simposiosSinSala) {
      try {
        let nuevaSala;

        if (simposio.scheduled_day && simposio.scheduled_time_block) {
          nuevaSala = encontrarSalaDisponible(simposio.scheduled_day, simposio.scheduled_time_block);

          if (!nuevaSala) {
            console.log(`  ID ${simposio.id}: No hay salas U- disponibles para ${simposio.scheduled_day} - ${simposio.scheduled_time_block}`);
            errores++;
            continue;
          }
        } else {
          nuevaSala = 22;
        }

        await pool.query(`
          UPDATE events
          SET room = $1
          WHERE id = $2
        `, [nuevaSala, simposio.id]);

        console.log(`  ID ${simposio.id}: Asignado a sala ${nuevaSala}`);
        movidos++;

      } catch (error) {
        console.error(`Error asignando sala a ID ${simposio.id}:`, error.message);
        errores++;
      }
    }

    // 5. Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('RESUMEN DE LA CORRECCIÓN');
    console.log('='.repeat(60));
    console.log(`Simposios movidos correctamente: ${movidos}`);
    console.log(`Errores encontrados: ${errores}`);
    console.log(`Salas utilizadas: 22-32 (Salas U-)`);
    console.log('='.repeat(60) + '\n');

    // 6. Verificar que todo esté correcto
    const { rows: verificacion } = await pool.query(`
      SELECT COUNT(*) as incorrectos
      FROM events
      WHERE event_type = 'simposio'
        AND room IS NOT NULL
        AND (room::integer < 22 OR room::integer > 32)
    `);

    if (parseInt(verificacion[0].incorrectos) === 0) {
      console.log('¡Verificación exitosa! Todos los simposios están ahora en salas 22-32.');
    } else {
      console.log(`Aún quedan ${verificacion[0].incorrectos} simposios en salas incorrectas.`);
    }

  } catch (error) {
    console.error('Error durante la corrección:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar el script
if (require.main === module) {
  fixSimposiosRooms()
    .then(() => {
      console.log('\nScript completado.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\nScript falló:', error);
      process.exit(1);
    });
}

module.exports = fixSimposiosRooms;
