// api/admin/sync-mdb.js
require('dotenv').config({ path: '../../.env.local' });
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const URL_MBD_PONENCIAS = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSPWPcv_xytqMvzC-zRhcdSg7WAU2skCTJ24CjfgpQRDeyayd7O6k-WWdPF5Z9vU8s5FA5ZCCQdxMJu/pub?gid=408175250&single=true&output=csv";
const URL_MBD_SIMPOSIOS = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSPWPcv_xytqMvzC-zRhcdSg7WAU2skCTJ24CjfgpQRDeyayd7O6k-WWdPF5Z9vU8s5FA5ZCCQdxMJu/pub?gid=1740533037&single=true&output=csv";
const PRIMARY_LANG = 'es';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido.' });
  }

  try {
    // 1. Verificar autenticación
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token de autorización requerido.' });
    }
    
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET);

    console.log('Iniciando sincronización manual con la MBD...');

    // 2. Obtener datos de las hojas con mejor manejo de errores
    const [ponenciasRes, simposiosRes] = await Promise.all([
        fetch(URL_MBD_PONENCIAS).catch(err => { throw new Error(`Error al obtener ponencias: ${err.message}`); }),
        fetch(URL_MBD_SIMPOSIOS).catch(err => { throw new Error(`Error al obtener simposios: ${err.message}`); })
    ]);

    if (!ponenciasRes.ok) throw new Error(`Error HTTP en ponencias: ${ponenciasRes.status}`);
    if (!simposiosRes.ok) throw new Error(`Error HTTP en simposios: ${simposiosRes.status}`);

    const ponenciasCSV = await ponenciasRes.text();
    const simposiosCSV = await simposiosRes.text();

    // Verificar que los CSVs no estén vacíos
    if (!ponenciasCSV.trim() || !simposiosCSV.trim()) {
      throw new Error('Las hojas de cálculo están vacías o no se pudieron cargar.');
    }

    // 3. Parsear los datos
    const { parse } = require('csv-parse/sync');
    let mbdPonencias, mbdSimposios;
    
    try {
      mbdPonencias = parse(ponenciasCSV, { columns: true, skip_empty_lines: true, trim: true });
      mbdSimposios = parse(simposiosCSV, { columns: true, skip_empty_lines: true, trim: true });
    } catch (parseError) {
      throw new Error(`Error al procesar el formato de las hojas: ${parseError.message}`);
    }
    
    // 4. Consolidar todos los trabajos de la MBD en un mapa único
    const allWorksMBD = new Map();
    [...mbdPonencias, ...mbdSimposios].forEach(row => {
        const id = row.ID_Trabajo;
        if (!id) return;

        if (!allWorksMBD.has(id)) {
            allWorksMBD.set(id, {
                id: id,
                type: row.Tipo_Trabajo?.toLowerCase().includes('simposio') ? 'simposio' : 'ponencia',
                title: { [PRIMARY_LANG]: row.Titulo_Trabajo || 'Sin título' },
                eje: { [PRIMARY_LANG]: (row.Eje_Tematico || 'Sin eje temático') },
                authors: new Set(),
                emails: new Set(), // Nuevo conjunto para almacenar los correos electrónicos
            });
        }
        if (row.Nombre_Autor) allWorksMBD.get(id).authors.add(row.Nombre_Autor.trim());
        if (row.Email_Autor) allWorksMBD.get(id).emails.add(row.Email_Autor.trim());
    });

    console.log(`   -> Total trabajos procesados desde MBD: ${allWorksMBD.size}`);

    // 5. Obtener los IDs que ya existen en nuestra base de datos
    const { rows: existingEvents } = await pool.query('SELECT id FROM events');
    const existingIds = new Set(existingEvents.map(row => row.id));

    console.log(`   -> Eventos existentes en BD: ${existingIds.size}`);

    // 6. Comparar y encontrar qué trabajos son realmente nuevos
    const newWorksToInsert = [];
    for (const work of allWorksMBD.values()) {
      if (!existingIds.has(work.id)) {
        newWorksToInsert.push(work);
      }
    }

    // 7. Si hay trabajos nuevos, insertarlos en la base de datos
    if (newWorksToInsert.length > 0) {
      console.log(`   -> Se encontraron ${newWorksToInsert.length} trabajos nuevos. Insertando...`);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const work of newWorksToInsert) {
          const query = `
            INSERT INTO events (id, event_type, title, authors, emails, eje, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'borrador') ON CONFLICT (id) DO NOTHING;`;
          
          await client.query(query, [
            work.id,
            work.type,
            work.title,
            { [PRIMARY_LANG]: Array.from(work.authors).join(', ') },
            { [PRIMARY_LANG]: Array.from(work.emails).join(', ') },
            work.eje
          ]);
        }
        await client.query('COMMIT');
        console.log(`   ✅ Sincronización completada exitosamente.`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Error durante la inserción en BD: ${e.message}`);
      } finally {
        client.release();
      }
    } else {
      console.log(`   ℹ️  No se encontraron trabajos nuevos para insertar.`);
    }

    return res.status(200).json({ 
      message: `Sincronización completada exitosamente. Se añadieron ${newWorksToInsert.length} nuevos eventos.`,
      addedCount: newWorksToInsert.length,
      totalProcessed: allWorksMBD.size,
      existingCount: existingIds.size
    });

  } catch (error) {
    console.error('❌ Error durante la sincronización manual:', error);
    
    // Enviar errores más específicos
    let errorMessage = 'Error interno del servidor durante la sincronización.';
    let statusCode = 500;
    
    if (error.message.includes('Token') || error.message.includes('autorización')) {
      statusCode = 401;
      errorMessage = 'Token de autorización inválido.';
    } else if (error.message.includes('Error al obtener') || error.message.includes('Error HTTP')) {
      statusCode = 503;
      errorMessage = 'No se pudieron obtener los datos de las hojas de cálculo. Verifica las URLs o intenta más tarde.';
    } else if (error.message.includes('vacías')) {
      statusCode = 400;
      errorMessage = 'Las hojas de cálculo están vacías o tienen un formato incorrecto.';
    } else if (error.message.includes('Error al procesar el formato')) {
      statusCode = 422;
      errorMessage = 'Error al procesar el formato de las hojas de cálculo.';
    } else if (error.message.includes('Error durante la inserción')) {
      statusCode = 500;
      errorMessage = 'Error al guardar los datos en la base de datos.';
    }
    
    return res.status(statusCode).json({ 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};