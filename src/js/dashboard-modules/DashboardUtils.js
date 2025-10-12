/**
 * DashboardUtils.js
 * Funciones utilitarias para el dashboard del congreso
 *
 * Contiene:
 * - debounce: Retrasar ejecución de funciones
 * - throttle: Limitar frecuencia de ejecución
 * - showLoading: Mostrar/ocultar overlay de carga
 * - showNotification: Sistema de notificaciones toast
 * - getPooledElement/returnToPool: Pool de elementos DOM reutilizables
 * - handleError/handleAuthError: Manejo de errores
 * - invalidateCache: Invalidar cache
 */

export const DashboardUtils = {
  /**
   * Debounce: Retrasa la ejecución de una función hasta que pasen X ms sin llamarla
   *
   * @param {string} key - Identificador único para el timer
   * @param {Function} func - Función a ejecutar
   * @param {number} delay - Tiempo de espera en milisegundos
   * @returns {Function} Función debounced
   */
  debounce(key, func, delay) {
    return (...args) => {
      clearTimeout(this.debounceTimers.get(key));
      this.debounceTimers.set(key, setTimeout(() => func.apply(this, args), delay));
    };
  },

  /**
   * Throttle: Limita la frecuencia de ejecución de una función
   *
   * @param {Function} func - Función a ejecutar
   * @param {number} delay - Tiempo mínimo entre ejecuciones en ms
   * @returns {Function} Función throttled
   */
  throttle(func, delay) {
    let lastCall = 0;
    return (...args) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        return func.apply(this, args);
      }
    };
  },

  /**
   * Muestra u oculta el overlay de carga
   *
   * @param {boolean} show - true para mostrar, false para ocultar
   */
  showLoading(show) {
    this.elements.loadingOverlay?.classList.toggle('active', show);
    document.body.style.cursor = show ? 'wait' : '';
  },

  /**
   * Sistema de notificaciones toast con throttling
   * Muestra notificaciones elegantes con iconos y animaciones
   *
   * @param {string} message - Mensaje a mostrar
   * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
   * @param {number} duration - Duración en ms (default: 4000)
   */
  showNotification(message, type = 'info', duration = 4000) {
    // Throttle notificaciones para evitar spam
    const now = Date.now();
    const key = `${message}-${type}`;

    if (this.notificationThrottle.has(key)) {
      const lastShown = this.notificationThrottle.get(key);
      if (now - lastShown < 2000) {
        return;
      }
    }

    this.notificationThrottle.set(key, now);

    // Crear contenedor de notificaciones si no existe
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    // Iconos SVG para cada tipo
    const icons = {
      success: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
      </svg>`,
      error: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
      </svg>`,
      warning: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>`,
      info: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`
    };

    // Crear notificación toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon-wrapper">${icons[type] || icons.info}</div>
        <div class="toast-message">${message}</div>
        <button class="toast-close" aria-label="Cerrar">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>
      <div class="toast-progress"></div>
    `;

    // Agregar al contenedor
    container.appendChild(toast);

    // Animación de entrada
    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });

    // Barra de progreso
    const progressBar = toast.querySelector('.toast-progress');
    progressBar.style.animation = `toastProgress ${duration}ms linear forwards`;

    // Botón de cerrar
    const closeBtn = toast.querySelector('.toast-close');
    const removeToast = () => {
      toast.classList.remove('toast-show');
      toast.classList.add('toast-hide');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    };

    closeBtn.addEventListener('click', removeToast);

    // Auto-cerrar
    setTimeout(removeToast, duration);
  },

  /**
   * Obtiene un elemento del pool o crea uno nuevo
   * Pool de elementos DOM reutilizables para mejor performance
   *
   * @param {string} type - Tipo de elemento ('eventCards', 'notifications')
   * @param {string} template - HTML template del elemento
   * @returns {HTMLElement} Elemento del pool o nuevo
   */
  getPooledElement(type, template) {
    const pool = this.elementPool[type];
    let element = pool.pop();

    if (!element) {
      element = document.createElement('div');
    }

    element.innerHTML = template;
    return element.firstElementChild || element;
  },

  /**
   * Devuelve un elemento al pool para reutilización
   *
   * @param {string} type - Tipo de elemento
   * @param {HTMLElement} element - Elemento a devolver
   */
  returnToPool(type, element) {
    if (this.elementPool[type].length < 20) {
      element.innerHTML = '';
      element.className = '';
      this.elementPool[type].push(element);
    }
  },

  /**
   * Manejo centralizado de errores
   * Log en consola, notificación al usuario y tracking analytics
   *
   * @param {string} context - Contexto del error
   * @param {Error} error - Objeto error
   * @param {boolean} showNotification - Mostrar notificación al usuario
   */
  handleError(context, error, showNotification = true) {
    console.error(`${context}:`, error);

    if (showNotification) {
      const errorMessage = error.message || 'Ha ocurrido un error inesperado';
      const isDevelopment = window.location.hostname === 'localhost';

      this.throttledShowNotification(
        isDevelopment ? `${context}: ${errorMessage}` : 'Ha ocurrido un error. Por favor inténtalo de nuevo.',
        'error'
      );
    }

    if (window.gtag) {
      gtag('event', 'exception', {
        description: `${context}: ${error.message}`,
        fatal: false
      });
    }
  },

  /**
   * Manejo de errores de autenticación
   * Limpia sesión y redirige al login
   */
  handleAuthError() {
    sessionStorage.clear();
    this.showNotification('Sesión expirada. Redirigiendo al login...', 'warning');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 2000);
  },

  /**
   * Invalida entradas del cache que coincidan con los patrones
   *
   * @param {Array<string>} patterns - Patrones a buscar en las keys del cache
   */
  invalidateCache(patterns = []) {
    if (patterns.length === 0) {
      this.cache.clear();
      return;
    }

    for (const [key] of this.cache) {
      if (patterns.some(pattern => key.includes(pattern))) {
        this.cache.delete(key);
      }
    }
  },

  /**
   * Cleanup de recursos al descargar el dashboard
   * Limpia timers, observers, instancias Sortable, etc.
   */
  cleanup() {
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();

    if (this.searchController) {
      this.searchController.abort();
    }

    this.sortableInstances.forEach(instance => instance?.destroy?.());

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    this.cache.clear();

    console.log('Dashboard cleanup completed');
  }
};
