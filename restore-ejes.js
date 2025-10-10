require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Conexión a la base de datos
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.POSTGRES_URL.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function main() {
  try {
    // Obtener nombre del archivo de backup del argumento de la línea de comandos
    const backupFile = process.argv[2];
    if (!backupFile) {
      console.error('❌ Error: Debes especificar el nombre del archivo de backup.');
      console.log('Uso: node restore-ejes.js nombre-del-archivo-backup.json');

      // Mostrar backups disponibles
      const backupDir = path.join(process.cwd(), 'backups');
      if (fs.existsSync(backupDir)) {
        const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
        if (backups.length > 0) {
          console.log('\nBackups disponibles:');
          backups.forEach(file => console.log(`- ${file}`));
        } else {
          console.log('\nNo hay backups disponibles.');
        }
      }

      return;
    }

    console.log(`🔄 Iniciando restauración desde backup: ${backupFile}`);

    // Verificar que el archivo existe
    const backupDir = path.join(process.cwd(), 'backups');
    const backupPath = path.join(backupDir, backupFile);

    if (!fs.existsSync(backupPath)) {
      console.error(`❌ Error: Archivo de backup no encontrado: ${backupPath}`);
      return;
    }

    // Leer el archivo de backup
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

    if (!Array.isArray(backupData) || backupData.length === 0) {
      console.error('❌ Error: Formato de archivo de backup inválido o vacío.');
      return;
    }

    console.log(`📦 Restaurando ${backupData.length} eventos desde backup...`);

    // Restaurar datos
    const client = await pool.connect();
    let restoredCount = 0;

    try {
      await client.query('BEGIN');

      for (const event of backupData) {
        const { id, eje } = event;
        await client.query(
          `UPDATE events SET eje = $1 WHERE id = $2`,
          [eje, id]
        );
        restoredCount++;
      }

      await client.query('COMMIT');
      console.log(`✅ Restauración completada exitosamente`);
      console.log(`   Eventos restaurados: ${restoredCount}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Error durante la restauración:', error.message);
  } finally {
    await pool.end();
  }
}

main();