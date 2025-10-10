/**
 * Utilidades para procesamiento de ejes temáticos
 */

/**
 * Extrae el número de eje de un objeto de evento
 * @param {Object} event - Objeto evento con campo eje
 * @returns {String|null} - Número de eje o null si no se encuentra
 */
function extractEjeNumber(event) {
  if (event.eje && event.eje.es && typeof event.eje.es === 'string') {
    const match = event.eje.es.match(/EJE\s*(\d+)/i);
    if (match) return match[1];
  }
  return null;
}

/**
 * Crea una versión corta del eje con sus palabras más significativas
 * @param {Object} event - Objeto evento con campo eje
 * @returns {String} - Versión corta del eje o cadena vacía
 */
function extractEjeShort(event) {
  if (event.eje && event.eje.es && typeof event.eje.es === 'string') {
    // Extrae "EJE N: " y las primeras palabras significativas
    const ejeText = event.eje.es;
    const match = ejeText.match(/EJE\s*(\d+):\s*([\w\s]+)/i);
    if (match) {
      const ejeNum = match[1];
      const descripcion = match[2].trim();
      // Tomar las primeras 3 palabras significativas
      const palabras = descripcion.split(/\s+/).filter(p => p.length > 3).slice(0, 3);
      return `EJE ${ejeNum}: ${palabras.join(' ')}`;
    }
    // Si no se puede extraer, devolver el número del eje
    const numMatch = ejeText.match(/EJE\s*(\d+)/i);
    if (numMatch) return `EJE ${numMatch[1]}`;
  }
  return '';
}

export {
  extractEjeNumber,
  extractEjeShort
};