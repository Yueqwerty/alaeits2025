# ALAEITS 2025 - Interactive Program Web App

## Resumen Técnico

Aplicación web de una sola página (SPA) construida con Vanilla JS para la visualización interactiva del programa de un seminario. El contenido es obtenido dinámicamente vía Fetch API desde una hoja de cálculo de Google Sheets que actúa como un CMS headless. La interfaz está construida con Tailwind CSS, compilado localmente a través de su CLI para una máxima optimización.

## Stack Tecnológico

-   **Front-End:** HTML5, CSS3 (con Custom Properties), JavaScript (ES6+).
-   **Framework CSS:** Tailwind CSS (compilado con PostCSS a través de Tailwind CLI).
-   **Fuente de Datos:** Google Sheets (publicado en formato CSV).
-   **Entorno de Desarrollo:** Node.js y npm para la gestión de dependencias y la ejecución de scripts.

## Arquitectura y Funcionalidades Clave

-   **Fetching Asíncrono de Datos:** Al cargar el DOM, la aplicación ejecuta una petición `fetch` asíncrona a la URL del CSV. Se incluye un timestamp como query parameter para evitar problemas de caché (cache-busting).
-   **Parsing de CSV:** El texto plano del CSV es parseado a un array de objetos JavaScript. El parser utiliza una expresión regular para manejar correctamente las comas encapsuladas dentro de comillas, asegurando la integridad de los datos.
-   **Renderizado y Manipulación del DOM:** Las tarjetas del programa se generan dinámicamente y se inyectan en el DOM. Las actualizaciones por filtros o búsquedas se gestionan eficientemente en el lado del cliente, sin necesidad de nuevas peticiones de red.
-   **Gestión de Estado Local:** Un objeto principal `App` en JavaScript maneja el estado de la aplicación (filtros actuales, día seleccionado, etc.). Los favoritos del usuario se persisten entre sesiones utilizando la `localStorage API`.
-   **URLs Reactivas (Deep Linking):** El estado de los filtros y la vista actual se codifica en el hash de la URL (`#`). Esto permite compartir enlaces directos a vistas específicas del programa, las cuales son interpretadas al cargar la página.
-   **Build Optimizado:** El uso del CLI de Tailwind permite "purgar" todas las clases no utilizadas, generando un archivo `output.css` final extremadamente ligero, optimizado para producción.

## Instalación y Desarrollo Local

**Prerrequisitos:** Tener [Node.js](https://nodejs.org/) (v16+) instalado.

1.  **Clonar el repositorio:**
    ```bash
    git clone https://github.com/Yuequerty/alaeits2025.git
    cd alaeits2025
    ```

2.  **Instalar dependencias:**
    ```bash
    npm install
    ```

3.  **Iniciar el compilador de Tailwind en modo "watch":**
    Este comando vigilará tus archivos `index.html` y `script.js` y reconstruirá `dist/output.css` automáticamente cada vez que guardes un cambio.
    ```bash
    npx tailwindcss -i ./src/css/input.css -o ./dist/output.css --watch
    ```

4.  **Servir el proyecto:**
    Abre `index.html` en tu navegador. Se recomienda usar una extensión como [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) para Visual Studio Code, que proporciona recarga en vivo.