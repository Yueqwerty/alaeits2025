# 🚀 API de Generación de Certificados - Configuración

## Descripción

API optimizada para generar certificados masivamente desde Google Sheets a Google Drive usando Vercel Pro.

### Mejoras vs Apps Script:
- ✅ **Sin límite de 50 filas** - Procesa todos los certificados pendientes
- ✅ **Procesamiento paralelo** - 10 certificados simultáneos
- ✅ **Tiempo de ejecución: 5 minutos** (vs 6 min de Apps Script)
- ✅ **Caché de carpetas** - Evita búsquedas repetidas en Drive
- ✅ **Reintentos automáticos** - 3 intentos por certificado
- ✅ **Manejo robusto de errores** - No detiene el proceso completo
- ✅ **Idempotencia** - Elimina y regenera si ya existe

## 📋 Prerequisitos

1. **Cuenta de Google Cloud Platform**
2. **Service Account con acceso a:**
   - Google Sheets API
   - Google Drive API
   - Google Docs API
3. **Vercel Pro Plan** (para maxDuration: 300s)

## 🔧 Configuración

### 1. Crear Service Account en Google Cloud

```bash
# 1. Ve a https://console.cloud.google.com/
# 2. Crea un nuevo proyecto o selecciona uno existente
# 3. Habilita las APIs:
#    - Google Sheets API
#    - Google Drive API
#    - Google Docs API
# 4. Crea credenciales > Service Account
# 5. Descarga el archivo JSON de credenciales
```

### 2. Compartir recursos con el Service Account

```bash
# Comparte con el email del service account:
# ejemplo: mi-servicio@proyecto.iam.gserviceaccount.com

# Recursos a compartir (Editor):
# - Google Sheet (ID: 1ZH2jFcF-sYAyB0qqbhLI-e6iX51ZcUv4szMGHXhz6xM)
# - Carpeta PDFs (ID: 1OscZGxao6gn6dw3byGNQt7gSpPXzOxdA)
# - Carpeta DOCs (ID: 1cQ-tJRcmStB_Fg26-C2npoKNbTnBTyWX)
# - Plantilla (ID: 10KjSYnysBdhs1FVdvhYL6PjvtdYwbRSjEtnWj3OirM0)
```

### 3. Variables de entorno en Vercel

Agrega estas variables en el dashboard de Vercel:

```bash
# Credenciales de Google (contenido completo del JSON)
GOOGLE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"..."}

# Secret para autenticación
ADMIN_SECRET=tu_secreto_super_seguro_aqui

# URLs de PostgreSQL (ya las tienes)
POSTGRES_URL=postgresql://...
```

### 4. Instalar dependencias

```bash
npm install googleapis
```

## 🚀 Uso

### Desde el Admin Panel (Recomendado)

1. Ve al admin panel
2. Haz clic en "Actualizar Certificados"
3. El sistema procesará automáticamente todos los pendientes

### Desde cURL

```bash
curl -X POST https://tu-dominio.vercel.app/api/certificates/generate \
  -H "Authorization: Bearer tu_secreto_super_seguro_aqui" \
  -H "Content-Type: application/json"
```

### Desde JavaScript

```javascript
const response = await fetch('/api/certificates/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer tu_secreto_super_seguro_aqui',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data);
```

## 📊 Respuesta de la API

```json
{
  "success": true,
  "message": "Procesamiento completado",
  "stats": {
    "total": 500,
    "pending": 200,
    "processed": 198,
    "errors": 2,
    "duration": "45.23s",
    "throughput": "4.38 cert/s"
  },
  "results": [
    {
      "rowIndex": 5,
      "id": "P513",
      "autor": "Juan Pérez",
      "status": "OK",
      "docUrl": "https://docs.google.com/document/d/...",
      "pdfUrl": "https://drive.google.com/file/d/..."
    }
  ],
  "errors": [
    {
      "rowIndex": 42,
      "id": "P520",
      "autor": "María García",
      "error": "Falta ID o AUTOR"
    }
  ]
}
```

## ⚙️ Configuración Avanzada

Edita `/api/certificates/generate.js`:

```javascript
const CONFIG = {
  // IDs de recursos
  PLANTILLA_ID: '10KjSYnysBdhs1FVdvhYL6PjvtdYwbRSjEtnWj3OirM0',
  CARPETA_PDF_ID: '1OscZGxao6gn6dw3byGNQt7gSpPXzOxdA',
  CARPETA_DOC_ID: '1cQ-tJRcmStB_Fg26-C2npoKNbTnBTyWX',
  SHEET_ID: '1ZH2jFcF-sYAyB0qqbhLI-e6iX51ZcUv4szMGHXhz6xM',
  SHEET_NAME: 'Cruce',

  // Optimización
  CONCURRENT_LIMIT: 10,  // ⬆️ Aumentar para más velocidad (cuidado con rate limits)
  BATCH_SIZE: 100,       // Leer de 100 en 100
  RETRY_ATTEMPTS: 3,     // Reintentos por certificado
  RETRY_DELAY: 1000,     // Delay entre reintentos (ms)
};
```

## 🔍 Monitoreo y Logs

### Ver logs en tiempo real (Vercel)

```bash
vercel logs --follow
```

### Logs estructurados

Todos los logs tienen formato JSON:

```json
{
  "timestamp": "2025-10-28T10:30:00.000Z",
  "level": "info",
  "message": "Procesando certificado",
  "id": "P513",
  "autor": "Juan Pérez",
  "rowIndex": 5
}
```

## 🐛 Troubleshooting

### Error: "No autorizado"
- Verifica que el `ADMIN_SECRET` sea correcto
- Revisa el header `Authorization: Bearer ...`

### Error: "Insufficient Permission"
- Verifica que el Service Account tenga permisos de Editor
- Comparte el Sheet y carpetas con el email del service account

### Timeouts
- Reduce `CONCURRENT_LIMIT` de 10 a 5
- Aumenta `maxDuration` en vercel.json (Vercel Pro)

### Rate Limits de Google
- Reduce `CONCURRENT_LIMIT` a 5 o menos
- Agrega delay entre batches

## 📈 Performance

### Benchmarks esperados:
- **Velocidad:** 4-6 certificados/segundo
- **100 certificados:** ~20-25 segundos
- **500 certificados:** ~90-120 segundos
- **1000 certificados:** ~180-220 segundos

### Optimizaciones aplicadas:
1. ✅ Procesamiento paralelo (10 concurrentes)
2. ✅ Caché de carpetas (evita búsquedas)
3. ✅ Batch updates a Sheets
4. ✅ Reutilización de conexiones
5. ✅ Minimización de sleeps

## 🔒 Seguridad

- ✅ Autenticación por Bearer token
- ✅ CORS configurado
- ✅ Service Account (no OAuth)
- ✅ Secrets en variables de entorno
- ✅ Sin exposición de credenciales

## 📝 Estructura de Carpetas Generada

```
Google Drive/
├── PDFs/
│   ├── Juan Pérez/
│   │   └── P513/
│   │       └── P513 - Juan Pérez.pdf
│   └── María García/
│       └── P520/
│           └── P520 - María García.pdf
└── DOCs/
    ├── Juan Pérez/
    │   └── P513/
    │       └── P513 - editable
    └── María García/
        └── P520/
            └── P520 - editable
```

## 🎯 Próximos Pasos

1. ✅ Crear el endpoint API
2. ⏳ Configurar credenciales en Vercel
3. ⏳ Probar con dataset pequeño
4. ⏳ Ejecutar procesamiento completo
5. ⏳ Integrar con admin panel

## 📞 Soporte

Si tienes problemas, revisa:
1. Logs de Vercel
2. Permisos del Service Account
3. Variables de entorno configuradas
4. Rate limits de Google APIs
