// Script para ejecutar la migración que añade el campo emails
require('dotenv').config({ path: '../../.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Conexión a la base de datos
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('🔄 Ejecutando migración para añadir campo emails a la tabla events...');

  try {
    // Leer el archivo SQL de migración
    const migrationPath = path.join(__dirname, 'add-emails-field.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    // Ejecutar la migración
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migrationSql);
      await client.query('COMMIT');
      console.log('✅ Migración ejecutada exitosamente.');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Error durante la migración:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Ejecutar el script
main();