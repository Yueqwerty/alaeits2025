require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Script para mover eventos regulares (NO simposios) que están en salas U- (22-32)
 * a salas regulares (1-21)
 */

async function fixRegularEventsInURooms() {
  console.log('Moviendo eventos regulares fuera de salas U- (22-32)...\n');

  try {
    // 1. Consultar eventos regulares en salas U-
    const { rows: eventosRegulares } = await pool.query(`
      SELECT id, event_type, room, scheduled_day, scheduled_time_block, status
      FROM events
      WHERE event_type != 'simposio'
        AND room::integer BETWEEN 22 AND 32
      ORDER BY room::integer, scheduled_day, scheduled_time_block
    `);

    console.log(`Eventos regulares en salas U- encontrados: ${eventosRegulares.length}\n`);

    if (eventosRegulares.length === 0) {
      console.log('¡No hay eventos regulares en salas U-! Todo está correcto.');
      return;
    }

    // 2. Obtener ocupación de salas 1-21
    const { rows: ocupacionSalas } = await pool.query(`
      SELECT room, scheduled_day, scheduled_time_block, COUNT(*) as eventos
      FROM events
      WHERE room::integer BETWEEN 1 AND 21
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

    // 3. Función para encontrar sala regular disponible
    function encontrarSalaRegularDisponible(dia, bloque) {
      // Buscar en salas 1-21
      for (let sala = 1; sala <= 21; sala++) {
        const key = `${sala}-${dia}-${bloque}`;
        const ocupacion = ocupacionMap[key] || 0;

        // Permitir hasta 6 eventos por sala
        if (ocupacion < 6) {
          ocupacionMap[key] = ocupacion + 1;
          return sala;
        }
      }
      return null; // No hay salas disponibles
    }

    let movidos = 0;
    let errores = 0;
    let sinProgramar = 0;

    console.log('Iniciando reasignación...\n');

    // 4. Procesar cada evento
    for (const evento of eventosRegulares) {
      try {
        let nuevaSala;

        if (evento.scheduled_day && evento.scheduled_time_block) {
          // Evento programado: encontrar sala disponible en el mismo día/bloque
          nuevaSala = encontrarSalaRegularDisponible(evento.scheduled_day, evento.scheduled_time_block);

          if (!nuevaSala) {
            console.log(`  ${evento.id}: No hay salas regulares disponibles para ${evento.scheduled_day} - ${evento.scheduled_time_block}`);
            errores++;
            continue;
          }
        } else {
          // Evento sin programar: asignar a sala 1 por defecto
          nuevaSala = 1;
          sinProgramar++;
        }

        // Actualizar en la base de datos
        await pool.query(`
          UPDATE events
          SET room = $1
          WHERE id = $2
        `, [nuevaSala, evento.id]);

        if (movidos < 20) {
          // Mostrar solo los primeros 20 para no llenar la consola
          console.log(`  ${evento.id} (${evento.event_type}): Movido de sala ${evento.room} → ${nuevaSala}`);
        }
        movidos++;

      } catch (error) {
        console.error(`Error moviendo ${evento.id}:`, error.message);
        errores++;
      }
    }

    if (movidos > 20) {
      console.log(`   ... y ${movidos - 20} eventos más`);
    }

    // 5. Resumen
    console.log('\n' + '='.repeat(60));
    console.log('RESUMEN DE LA CORRECCIÓN');
    console.log('='.repeat(60));
    console.log(`Eventos movidos correctamente: ${movidos}`);
    console.log(`Eventos sin programar: ${sinProgramar}`);
    console.log(`Errores encontrados: ${errores}`);
    console.log(`Movidos desde: Salas 22-32 (U-)`);
    console.log(`Movidos hacia: Salas 1-21 (Regulares)`);
    console.log('='.repeat(60) + '\n');

    // 6. Verificar
    const { rows: verificacion } = await pool.query(`
      SELECT COUNT(*) as restantes
      FROM events
      WHERE event_type != 'simposio'
        AND room::integer BETWEEN 22 AND 32
    `);

    if (parseInt(verificacion[0].restantes) === 0) {
      console.log('¡Verificación exitosa! No quedan eventos regulares en salas U-.');
    } else {
      console.log(`Aún quedan ${verificacion[0].restantes} eventos regulares en salas U-.`);
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
  fixRegularEventsInURooms()
    .then(() => {
      console.log('\nScript completado.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\nScript falló:', error);
      process.exit(1);
    });
}

module.exports = fixRegularEventsInURooms;
