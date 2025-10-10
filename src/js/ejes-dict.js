// Diccionario simple de ejes temáticos
const EJES = {
  '1': 'Historia y memoria',
  '2': 'Crisis capitalista',
  '3': 'Inflexiones ético-políticas',
  '4': 'Tensiones y desafíos',
  '5': 'Proyectos de investigación',
  '6': 'Procesos de intervención',
  '7': 'Formación de posgrado',
  '8': 'Articulación latinoamericana'
};

// Función para obtener el número de eje
function getEjeNumber(event) {
  if (!event.eje || !event.eje.es) return '';

  const match = event.eje.es.match(/EJE\s*(\d+)/i);
  return match ? match[1] : '';
}

// Función para obtener descripción corta
function getEjeDescripcion(numero) {
  return EJES[numero] || '';
}

// Función para obtener formato "EJE X: Descripción"
function getEjeFormatted(numero) {
  const desc = getEjeDescripcion(numero);
  return numero && desc ? `EJE ${numero}: ${desc}` : '';
}