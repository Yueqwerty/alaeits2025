# XXIV Seminario ALAEITS 2025

<div align="center">

![ALAEITS 2025](src/assets/images/logo-100-anios.png)

**Plataforma Web Interactiva para el XXIV Seminario Internacional ALAEITS**

*Crisis civilizatoria, luchas contra hegemónicas y proyectos emancipatorios*

[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=flat&logo=vercel)](https://vercel.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-v16+-green.svg)](https://nodejs.org)

</div>

---

## 📋 Tabla de Contenidos

- [Acerca del Proyecto](#-acerca-del-proyecto)
- [Características](#-características)
- [Stack Tecnológico](#-stack-tecnológico)
- [Arquitectura](#-arquitectura)
- [Comenzando](#-comenzando)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [API Endpoints](#-api-endpoints)
- [Deployment](#-deployment)
- [Contribuir](#-contribuir)
- [Licencia](#-licencia)

---

## 🎯 Acerca del Proyecto

Plataforma web integral desarrollada para el **XXIV Seminario Internacional ALAEITS 2025**, conmemorando los 100 años del Trabajo Social en Chile. El sistema proporciona una experiencia completa para participantes, organizadores y asistentes, incluyendo:

- **Programa Interactivo**: Visualización dinámica de ponencias, simposios y presentaciones
- **Sistema de Certificados Digitales**: Emisión y validación de certificados oficiales
- **Panel de Administración**: Gestión completa del evento y analíticas en tiempo real
- **Diseño Responsive**: Experiencia optimizada en dispositivos móviles y desktop

**Fechas del Evento**: 6-8 de Enero, 2025
**Sedes**: Universidad Central de Chile (UCEN) y Universidad Tecnológica Metropolitana (UTEM)

---

## ✨ Características

### 🗓️ Programa Interactivo

- ✅ **Búsqueda Avanzada**: Filtrado por tipo de evento, sala, sede, horario y texto libre
- ✅ **Visualización por Días**: Navegación intuitiva entre los 3 días del seminario
- ✅ **Sistema de Favoritos**: Marcado y persistencia de eventos favoritos (localStorage)
- ✅ **Vista de Mesa Completa**: Visualización detallada de simposios con timeline
- ✅ **Compartir Enlaces**: URLs limpias y deep linking para compartir eventos específicos
- ✅ **Export PDF**: Generación de PDFs para mesas completas
- ✅ **Highlighting**: Resaltado de términos de búsqueda en resultados

### 📜 Sistema de Certificados Digitales

- ✅ **Autenticación Dual**: Sistema para ponentes (ID + email) y oyentes (solo email)
- ✅ **Validación en Tiempo Real**: Verificación contra base de datos PostgreSQL
- ✅ **Multi-certificados**: Soporte para ponentes con múltiples presentaciones
- ✅ **Vista Previa**: Modal de visualización de certificados antes de descargar
- ✅ **Descarga Directa**: Formato PDF de alta calidad
- ✅ **URLs Limpias**: Sistema de rewrites sin extensiones .html

### 🔧 Panel de Administración

- ✅ **Dashboard Analítico**: Métricas en tiempo real del evento
- ✅ **Gestión de Eventos**: CRUD completo de ponencias y simposios
- ✅ **Detección de Conflictos**: Análisis automático de sobrecargas de salas
- ✅ **Sincronización MDB**: Integración con sistema de gestión de base de datos
- ✅ **Búsqueda Avanzada**: Filtrado multi-criterio de eventos
- ✅ **Operaciones en Masa**: Modificación de múltiples eventos simultáneamente

### 📱 Experiencia Mobile

- ✅ **Menú Hamburguesa Profesional**: Animaciones suaves y overlay con blur
- ✅ **Navegación Intuitiva**: Enlaces con iconos SVG y estados hover
- ✅ **CTA Destacado**: Botón de certificados prominente en menú móvil
- ✅ **Cierre Inteligente**: ESC key, click en overlay, o selección de enlace
- ✅ **Prevención de Scroll**: Bloqueo del scroll del body cuando el menú está abierto

### 📚 Presentaciones de Libros

- ✅ **Galería Visual**: Cards con imágenes de portadas
- ✅ **Información Detallada**: Autores, editoriales y descripciones
- ✅ **Responsive Design**: Adaptación perfecta a todos los dispositivos

---

## 🛠️ Stack Tecnológico

### Frontend

| Tecnología | Versión | Uso |
|-----------|---------|-----|
| **HTML5** | - | Estructura semántica |
| **CSS3** | - | Estilos con Custom Properties |
| **JavaScript** | ES6+ | Lógica de aplicación (Vanilla JS) |
| **Tailwind CSS** | 3.x | Framework CSS utility-first |
| **Google Sheets API** | - | CMS headless para datos del programa |

### Backend (Serverless)

| Tecnología | Uso |
|-----------|-----|
| **Vercel Serverless Functions** | API endpoints |
| **Node.js** | Runtime para funciones serverless |
| **PostgreSQL (Vercel Postgres)** | Base de datos de certificados |

### Herramientas de Desarrollo

| Herramienta | Uso |
|------------|-----|
| **npm** | Gestión de dependencias |
| **PostCSS** | Procesamiento de CSS |
| **Git** | Control de versiones |
| **Vercel CLI** | Deployment y testing local |

---

## 🏗️ Arquitectura

### Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    ALAEITS 2025 Platform                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Frontend   │  │   Backend    │  │   Data Layer    │  │
│  │              │  │              │  │                 │  │
│  │  • index     │◄─┤  • API       │◄─┤  • PostgreSQL  │  │
│  │  • certs     │  │    Routes    │  │  • Google      │  │
│  │  • books     │  │  • Auth      │  │    Sheets      │  │
│  │  • admin     │  │  • CRUD      │  │                 │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Flujo de Datos

1. **Programa del Evento**: Google Sheets → CSV → Fetch API → Render DOM
2. **Certificados**: Form Input → API Validation → PostgreSQL → PDF Response
3. **Administración**: Dashboard UI → API Endpoints → Database → Update View

### Características de Rendimiento

- ✅ **Cache Busting**: Versionado automático de assets (CSS/JS)
- ✅ **API Caching**: Headers personalizados para control de caché
- ✅ **Clean URLs**: Rewrites de Vercel para URLs sin extensiones
- ✅ **Lazy Loading**: Carga diferida de imágenes
- ✅ **Minification**: CSS optimizado con Tailwind purge

---

## 🚀 Comenzando

### Prerrequisitos

- **Node.js** v16 o superior
- **npm** v7 o superior
- **Git** instalado
- Cuenta de **Vercel** (para deployment)

### Instalación Local

1. **Clonar el repositorio**
```bash
git clone https://github.com/Yuequerty/alaeits2025.git
cd alaeits2025
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
# Crear archivo .env.local
touch .env.local

# Agregar las siguientes variables:
POSTGRES_URL="postgresql://..."
POSTGRES_PRISMA_URL="postgresql://..."
POSTGRES_URL_NON_POOLING="postgresql://..."
```

4. **Ejecutar en desarrollo**
```bash
# Iniciar Tailwind CSS en modo watch
npx tailwindcss -i ./src/css/style.css -o ./dist/output.css --watch

# En otra terminal, servir la aplicación
npx vercel dev
```

5. **Abrir en navegador**
```
http://localhost:3000
```

### Scripts Disponibles

```bash
# Compilar CSS para producción
npm run build:css

# Limpiar archivos temporales
npm run clean

# Correr linter (si configurado)
npm run lint
```

---

## 📁 Estructura del Proyecto

```
alaeits2025/
│
├── api/                          # Serverless API Functions
│   ├── admin/                    # Endpoints de administración
│   │   ├── analytics.js          # Métricas del evento
│   │   ├── bulk-operations.js    # Operaciones masivas
│   │   ├── conflicts-endpoint.js # Detección de conflictos
│   │   ├── event-manager.js      # CRUD de eventos
│   │   ├── events.js             # Listado de eventos
│   │   ├── search.js             # Búsqueda avanzada
│   │   └── sync-mdb.js           # Sincronización DB
│   └── certificates/             # Sistema de certificados
│       └── validate.js           # Validación de certificados
│
├── src/                          # Código fuente
│   ├── assets/                   # Assets estáticos
│   │   └── images/               # Imágenes y logos
│   ├── css/                      # Estilos CSS
│   │   └── style.css             # CSS principal
│   └── js/                       # JavaScript
│       ├── certificados-api.js   # API de certificados
│       ├── dashboard.js          # Panel admin
│       ├── detailed-room-map.js  # Mapeo de salas
│       ├── ejes-dict.js          # Diccionario de ejes
│       └── script.js             # Script principal
│
├── certificados.html             # Portal de certificados
├── index.html                    # Página principal
├── presentaciones_libros.html    # Presentaciones de libros
├── admin.html                    # Panel de administración
│
├── vercel.json                   # Configuración de Vercel
├── tailwind.config.js            # Configuración de Tailwind
├── package.json                  # Dependencias del proyecto
├── .gitignore                    # Archivos ignorados por Git
└── README.md                     # Este archivo
```

---

## 🔌 API Endpoints

### Administración

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/admin/events` | Obtener todos los eventos |
| `GET` | `/api/admin/analytics` | Métricas del evento |
| `GET` | `/api/admin/search` | Búsqueda de eventos |
| `POST` | `/api/admin/event-manager` | Crear/Editar evento |
| `DELETE` | `/api/admin/event-manager` | Eliminar evento |
| `POST` | `/api/admin/bulk-operations` | Operaciones masivas |
| `GET` | `/api/admin/conflicts-endpoint` | Análisis de conflictos |
| `POST` | `/api/admin/sync-mdb` | Sincronizar base de datos |

### Certificados

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/certificates/validate` | Validar y obtener certificados |

### Parámetros de Ejemplo

**Validación de Certificados (Ponente)**
```json
{
  "type": "presenter",
  "paperId": "P513",
  "email": "ponente@example.com"
}
```

**Validación de Certificados (Oyente)**
```json
{
  "type": "attendee",
  "email": "oyente@example.com"
}
```

---

## 🌐 Deployment

El proyecto está configurado para deployment automático en **Vercel**.

### Deploy en Vercel

1. **Conectar repositorio**
```bash
vercel login
vercel link
```

2. **Configurar variables de entorno**
   - Ir a Vercel Dashboard → Project Settings → Environment Variables
   - Agregar todas las variables del archivo `.env.local`

3. **Deploy**
```bash
# Deploy a preview
vercel

# Deploy a producción
vercel --prod
```

### Configuración de Vercel

El archivo `vercel.json` incluye:

- ✅ **Clean URLs**: Remover extensiones `.html`
- ✅ **Rewrites**: Mapeo de rutas limpias
- ✅ **Headers**: Control de caché para API
- ✅ **CORS**: Configuración de acceso cross-origin

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Para cambios importantes:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

### Guía de Estilo

- Usar **ES6+** para JavaScript
- Seguir convenciones de **Tailwind CSS**
- Comentar código complejo
- Mantener funciones pequeñas y enfocadas

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

---

## 👥 Equipo

**Organizado por:**
- Universidad Central de Chile (UCEN)
- Universidad Tecnológica Metropolitana (UTEM)

**Desarrollado por:**
- [@Yuequerty](https://github.com/Yuequerty)

---

## 📞 Contacto

Para consultas sobre el evento:
- **Web**: [https://www.alaeits2025.cl/](https://www.alaeits2025.cl/)
- **Email**: contacto@alaeits2025.cl

Para issues técnicos:
- **GitHub Issues**: [Reportar un problema](https://github.com/Yuequerty/alaeits2025/issues)

---

<div align="center">

**XXIV Seminario ALAEITS 2025** | *Celebrando 100 años de Trabajo Social en Chile*

[Programa](/) • [Certificados](/certificados) • [Libros](/presentaciones_libros) • [Admin](/admin)

</div>
