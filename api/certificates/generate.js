/**
 * API Endpoint: POST /api/certificates/generate
 * Genera certificados masivamente desde Google Sheets a Google Drive
 * Optimizado para Vercel Pro con procesamiento paralelo
 */

const { google } = require('googleapis');

// Configuración
const CONFIG = {
  PLANTILLA_ID: '10KjSYnysBdhs1FVdvhYL6PjvtdYwbRSjEtnWj3OirM0',
  CARPETA_PDF_ID: '1OscZGxao6gn6dw3byGNQt7gSpPXzOxdA',
  CARPETA_DOC_ID: '1cQ-tJRcmStB_Fg26-C2npoKNbTnBTyWX',
  SHEET_ID: '1ZH2jFcF-sYAyB0qqbhLI-e6iX51ZcUv4szMGHXhz6xM',
  SHEET_NAME: 'Cruce',

  // Columnas (0-indexed para arrays)
  COL: {
    ID: 0,
    TITULO: 1,
    AUTOR: 4,
    LINK_DOC: 8,
    LINK_PDF: 9,
    ESTADO: 10,
    FECHA: 11
  },

  // Optimización
  CONCURRENT_LIMIT: 10, // Procesar 10 certificados en paralelo
  BATCH_SIZE: 100,      // Leer de 100 en 100 desde Sheets
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
};

// Utilidades
const log = (level, msg, data = {}) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message: msg,
    ...data
  }));
};

const cleanText = (v) => (v == null ? '' : String(v)).trim();

const normalizeFolderName = (name) =>
  name.replace(/[\\/:*?"<>|#\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Autenticación de Google
function getGoogleAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents'
    ]
  });

  return auth;
}

// Cache de carpetas para evitar búsquedas repetidas
class FolderCache {
  constructor(drive) {
    this.drive = drive;
    this.cache = new Map();
  }

  async getOrCreateFolder(parentId, folderName, cacheKey) {
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const normalizedName = normalizeFolderName(folderName);

    // Buscar si existe
    const searchResponse = await this.drive.files.list({
      q: `name='${normalizedName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    let folderId;
    if (searchResponse.data.files.length > 0) {
      folderId = searchResponse.data.files[0].id;
    } else {
      // Crear carpeta
      const createResponse = await this.drive.files.create({
        requestBody: {
          name: normalizedName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId]
        },
        fields: 'id'
      });
      folderId = createResponse.data.id;
    }

    this.cache.set(cacheKey, folderId);
    return folderId;
  }

  async getAuthorFolder(baseId, authorName, type) {
    const cacheKey = `${type}_${authorName.toLowerCase()}`;
    return this.getOrCreateFolder(baseId, authorName, cacheKey);
  }

  async getIdFolder(authorFolderId, id) {
    const cacheKey = `id_${authorFolderId}_${id}`;
    return this.getOrCreateFolder(authorFolderId, id, cacheKey);
  }
}

// Eliminar archivo si existe
async function deleteIfExists(drive, folderId, fileName) {
  try {
    const searchResponse = await drive.files.list({
      q: `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive'
    });

    for (const file of searchResponse.data.files) {
      await drive.files.update({
        fileId: file.id,
        requestBody: { trashed: true }
      });
    }
  } catch (error) {
    log('warn', 'Error eliminando archivo existente', { fileName, error: error.message });
  }
}

// Procesar un certificado individual con reintentos
async function processCertificateWithRetry(services, row, rowIndex, folderCache, attempt = 1) {
  const { sheets, drive, docs } = services;

  try {
    return await processCertificate(services, row, rowIndex, folderCache);
  } catch (error) {
    if (attempt < CONFIG.RETRY_ATTEMPTS) {
      log('warn', `Reintento ${attempt}/${CONFIG.RETRY_ATTEMPTS}`, {
        rowIndex,
        error: error.message
      });
      await sleep(CONFIG.RETRY_DELAY * attempt);
      return processCertificateWithRetry(services, row, rowIndex, folderCache, attempt + 1);
    }
    throw error;
  }
}

// Procesar un certificado individual
async function processCertificate(services, row, rowIndex, folderCache) {
  const { sheets, drive, docs } = services;

  const id = cleanText(row[CONFIG.COL.ID]);
  const titulo = cleanText(row[CONFIG.COL.TITULO]);
  const autor = cleanText(row[CONFIG.COL.AUTOR]);

  if (!id || !autor) {
    throw new Error('Falta ID o AUTOR');
  }

  log('info', 'Procesando certificado', { id, autor, rowIndex });

  // Obtener carpetas (con caché)
  const carpetaAutorPDF = await folderCache.getAuthorFolder(
    CONFIG.CARPETA_PDF_ID,
    autor,
    'pdf'
  );
  const carpetaAutorDOC = await folderCache.getAuthorFolder(
    CONFIG.CARPETA_DOC_ID,
    autor,
    'doc'
  );

  const carpetaIdPDF = await folderCache.getIdFolder(carpetaAutorPDF, id);
  const carpetaIdDOC = await folderCache.getIdFolder(carpetaAutorDOC, id);

  // Nombres de archivos
  const nombreDoc = `${id} - editable`;
  const nombrePdf = `${id} - ${autor}.pdf`;

  // Eliminar archivos existentes (idempotencia)
  await Promise.all([
    deleteIfExists(drive, carpetaIdDOC, nombreDoc),
    deleteIfExists(drive, carpetaIdPDF, nombrePdf)
  ]);

  // Crear copia del documento
  const copyResponse = await drive.files.copy({
    fileId: CONFIG.PLANTILLA_ID,
    requestBody: {
      name: nombreDoc,
      parents: [carpetaIdDOC]
    },
    fields: 'id, webViewLink'
  });

  const docId = copyResponse.data.id;
  const docUrl = copyResponse.data.webViewLink;

  // Esperar a que el documento esté disponible
  await sleep(500);

  // Reemplazar variables en el documento
  const docContent = await docs.documents.get({ documentId: docId });

  const requests = [
    {
      replaceAllText: {
        containsText: { text: '{{ID}}', matchCase: true },
        replaceText: id
      }
    },
    {
      replaceAllText: {
        containsText: { text: '{{Titulo}}', matchCase: true },
        replaceText: titulo || ''
      }
    },
    {
      replaceAllText: {
        containsText: { text: '{{AUTOR}}', matchCase: true },
        replaceText: autor
      }
    }
  ];

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: { requests }
  });

  // Generar PDF
  const pdfResponse = await drive.files.export({
    fileId: docId,
    mimeType: 'application/pdf'
  }, { responseType: 'arraybuffer' });

  const pdfFile = await drive.files.create({
    requestBody: {
      name: nombrePdf,
      parents: [carpetaIdPDF],
      mimeType: 'application/pdf'
    },
    media: {
      mimeType: 'application/pdf',
      body: Buffer.from(pdfResponse.data)
    },
    fields: 'id, webViewLink'
  });

  const pdfUrl = pdfFile.data.webViewLink;

  // Actualizar hoja
  const actualRow = rowIndex + 2; // +2 porque: 0-indexed + 1 header + 1 para 1-indexed
  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SHEET_ID,
    range: `${CONFIG.SHEET_NAME}!I${actualRow}:L${actualRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        docUrl,
        pdfUrl,
        'OK',
        new Date().toISOString()
      ]]
    }
  });

  log('info', 'Certificado generado exitosamente', { id, autor });

  return {
    rowIndex,
    id,
    autor,
    status: 'OK',
    docUrl,
    pdfUrl
  };
}

// Procesar en lotes con control de concurrencia
async function processInParallel(services, rows, folderCache) {
  const results = [];
  const errors = [];

  // Procesamiento con concurrencia limitada
  const processingPromises = rows.map(async (row, index) => {
    try {
      const result = await processCertificateWithRetry(
        services,
        row.data,
        row.originalIndex,
        folderCache
      );
      results.push(result);
    } catch (error) {
      const errorInfo = {
        rowIndex: row.originalIndex,
        id: cleanText(row.data[CONFIG.COL.ID]),
        autor: cleanText(row.data[CONFIG.COL.AUTOR]),
        error: error.message
      };
      errors.push(errorInfo);

      // Escribir error en la hoja
      const actualRow = row.originalIndex + 2;
      try {
        await services.sheets.spreadsheets.values.update({
          spreadsheetId: CONFIG.SHEET_ID,
          range: `${CONFIG.SHEET_NAME}!K${actualRow}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[`ERROR: ${error.message}`]]
          }
        });
      } catch (updateError) {
        log('error', 'Error actualizando estado de error', {
          rowIndex: row.originalIndex,
          error: updateError.message
        });
      }
    }
  });

  // Ejecutar con límite de concurrencia
  const chunks = [];
  for (let i = 0; i < processingPromises.length; i += CONFIG.CONCURRENT_LIMIT) {
    chunks.push(processingPromises.slice(i, i + CONFIG.CONCURRENT_LIMIT));
  }

  for (const chunk of chunks) {
    await Promise.all(chunk);
  }

  return { results, errors };
}

// Handler principal
module.exports = async (req, res) => {
  const startTime = Date.now();

  try {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      });
    }

    // Verificar auth
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken || authToken !== process.env.ADMIN_SECRET) {
      return res.status(401).json({
        success: false,
        message: 'No autorizado'
      });
    }

    log('info', 'Iniciando generación de certificados');

    // Inicializar servicios de Google
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });
    const docs = google.docs({ version: 'v1', auth });

    const services = { sheets, drive, docs };
    const folderCache = new FolderCache(drive);

    // Leer datos de la hoja
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SHEET_ID,
      range: `${CONFIG.SHEET_NAME}!A2:L`
    });

    const rows = response.data.values || [];

    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No hay datos para procesar',
        stats: { total: 0, processed: 0, errors: 0 }
      });
    }

    // Filtrar filas pendientes (estado vacío o con ERROR)
    const pendingRows = rows
      .map((row, index) => ({ data: row, originalIndex: index }))
      .filter(({ data }) => {
        const estado = cleanText(data[CONFIG.COL.ESTADO]);
        return estado === '' || estado.startsWith('ERROR');
      });

    if (pendingRows.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No hay filas pendientes',
        stats: { total: rows.length, processed: 0, errors: 0 }
      });
    }

    log('info', `Procesando ${pendingRows.length} certificados pendientes`);

    // Procesar en paralelo
    const { results, errors } = await processInParallel(
      services,
      pendingRows,
      folderCache
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    log('info', 'Generación completada', {
      total: pendingRows.length,
      successful: results.length,
      failed: errors.length,
      duration: `${duration}s`
    });

    return res.status(200).json({
      success: true,
      message: 'Procesamiento completado',
      stats: {
        total: rows.length,
        pending: pendingRows.length,
        processed: results.length,
        errors: errors.length,
        duration: `${duration}s`,
        throughput: `${(results.length / parseFloat(duration)).toFixed(2)} cert/s`
      },
      results: results.slice(0, 10), // Primeros 10 para no saturar
      errors: errors.slice(0, 10)    // Primeros 10 errores
    });

  } catch (error) {
    log('error', 'Error fatal en generación', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'Error en el procesamiento',
      error: error.message
    });
  }
};

// Configuración de Vercel
module.exports.config = {
  maxDuration: 300, // 5 minutos (Vercel Pro)
};
