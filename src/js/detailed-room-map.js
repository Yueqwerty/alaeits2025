/**
 * Mapeo detallado de salas virtuales a salas físicas
 *
 * Este archivo contiene el mapeo de los IDs numéricos de las salas (1-32)
 * a sus representaciones físicas en diferentes horarios del congreso.
 *
 * Estructura:
 * - Cada clave principal es una fecha (formato "DD/MM")
 * - Cada sala virtual (1-32) puede tener múltiples salas físicas a lo largo del día
 * - Cada sala física tiene: nombre, hora de inicio y fin
 *
 * Nota: Las salas 22-32 (con prefijo U-) están reservadas para simposios
 */

export const roomMap = {
  "14/10": {
    "1": [
      { nombre: "Aula A", inicio: "08:15", fin: "14:05" },
      { nombre: "C-104", inicio: "14:30", fin: "18:30" }
    ],
    "2": [
      { nombre: "D-103", inicio: "08:15", fin: "14:05" },
      { nombre: "B-313", inicio: "15:00", fin: "18:30" }
    ],
    "3": [
      { nombre: "D-202", inicio: "08:15", fin: "12:35" },
      { nombre: "SALA PM 1", inicio: "12:10", fin: "13:50" },
      { nombre: "B-312", inicio: "15:00", fin: "18:30" }
    ],
    "4": [
      { nombre: "D-105", inicio: "08:15", fin: "12:35" },
      { nombre: "SALA PM 2", inicio: "12:10", fin: "13:50" },
      { nombre: "SALA PM 3", inicio: "15:00", fin: "18:30" }
    ],
    "5": [
      { nombre: "D-209", inicio: "08:15", fin: "19:30" }
    ],
    "6": [
      { nombre: "D-207 am", inicio: "08:15", fin: "11:05" },
      { nombre: "SALA PM 4", inicio: "10:20", fin: "12:00" },
      { nombre: "SALA PM 5", inicio: "12:10", fin: "13:50" },
      { nombre: "D-207 pm", inicio: "14:15", fin: "18:35" }
    ],
    "7": [
      { nombre: "B-408", inicio: "08:15", fin: "19:30" }
    ],
    "8": [
      { nombre: "D-307", inicio: "08:15", fin: "19:30" }
    ],
    "9": [
      { nombre: "D-308", inicio: "08:30", fin: "12:30" },
      { nombre: "SALA PM 6", inicio: "12:10", fin: "13:50" },
      { nombre: "B-404", inicio: "15:00", fin: "18:30" }
    ],
    "10": [
      { nombre: "C-102", inicio: "08:15", fin: "19:30" }
    ],
    "11": [
      { nombre: "B-406", inicio: "08:15", fin: "17:05" },
      { nombre: "D-102", inicio: "16:50", fin: "18:30" }
    ],
    "12": [
      { nombre: "Sala Licenciatura", inicio: "08:00", fin: "19:30" }
    ],
    "13": [
      { nombre: "D-401", inicio: "08:30", fin: "18:30" }
    ],
    "14": [
      { nombre: "D-402", inicio: "08:15", fin: "19:30" }
    ],
    "15": [
      { nombre: "D-404", inicio: "08:15", fin: "19:30" }
    ],
    "16": [
      { nombre: "D-405", inicio: "08:15", fin: "19:30" }
    ],
    "17": [
      { nombre: "D-406", inicio: "08:15", fin: "19:30" }
    ],
    "18": [
      { nombre: "D-407", inicio: "08:15", fin: "19:30" }
    ],
    "19": [
      { nombre: "Salón Rojo", inicio: "08:30", fin: "20:00" },
      { nombre: "B-418", inicio: "12:45", fin: "18:35" },
      { nombre: "Aula Magna Central 1", inicio: "08:30", fin: "10:00" },
      { nombre: "Aula Magna Simposio", inicio: "10:20", fin: "12:00" },
      { nombre: "Aula Magna Simposio", inicio: "12:10", fin: "13:50" },
      { nombre: "Aula Magna Central 2", inicio: "15:00", fin: "16:40" },
      { nombre: "Aula Magna Simposio", inicio: "16:50", fin: "18:30" }
    ],
    "20": [
      { nombre: "Sala de Internalización", inicio: "08:15", fin: "18:30" }
    ],
    "21": [
      { nombre: "Híbrida 602", inicio: "08:15", fin: "15:00" }
    ],
    "22": [
      { nombre: "U-102", inicio: "08:15", fin: "18:30", esSimposio: true }
    ],
    "23": [
      { nombre: "U-103", inicio: "08:15", fin: "18:30", esSimposio: true }
    ],
    "24": [
      { nombre: "U-104", inicio: "08:15", fin: "18:30", esSimposio: true }
    ],
    "25": [
      { nombre: "U-105", inicio: "08:15", fin: "18:30", esSimposio: true }
    ],
    "26": [
      { nombre: "U-201", inicio: "08:15", fin: "18:30", esSimposio: true }
    ],
    "27": [
      { nombre: "U-202", inicio: "08:15", fin: "18:30", esSimposio: true }
    ],
    "28": [
      { nombre: "U-301", inicio: "08:15", fin: "18:30", esSimposio: true }
    ],
    "29": [
      { nombre: "U-302", inicio: "08:15", fin: "18:30", esSimposio: true }
    ],
    "30": [
      { nombre: "U-400", inicio: "08:15", fin: "18:30", esSimposio: true }
    ],
    "31": [
      { nombre: "U-Biblioteca", inicio: "08:15", fin: "18:30", esSimposio: true }
    ],
    "32": [
      { nombre: "U-Sala de Aprendizaje", inicio: "08:15", fin: "18:30", esSimposio: true }
    ]
  },

  "15/10": {
    "1": [
      { nombre: "C-103", inicio: "08:00", fin: "15:30" }
    ],
    "2": [
      { nombre: "D-103", inicio: "08:00", fin: "15:30" }
    ],
    "3": [
      { nombre: "D-207", inicio: "08:00", fin: "15:30" }
    ],
    "4": [
      { nombre: "D-209", inicio: "08:00", fin: "15:30" }
    ],
    "5": [
      { nombre: "D-307", inicio: "11:00", fin: "14:15" }
    ],
    "6": [
      { nombre: "B-408", inicio: "08:00", fin: "15:30" }
    ],
    "7": [
      { nombre: "D-202", inicio: "08:00", fin: "15:30" }
    ],
    "8": [
      { nombre: "Sala Licenciatura", inicio: "08:00", fin: "15:30" }
    ],
    "9": [
      { nombre: "Aula C", inicio: "08:15", fin: "15:35" }
    ],
    "10": [
      { nombre: "Aula D", inicio: "08:15", fin: "15:35" }
    ],
    "11": [
      { nombre: "Aula D-406", inicio: "08:15", fin: "15:35" }
    ],
    "12": [
      { nombre: "Aula D-407", inicio: "08:15", fin: "15:35" }
    ],
    "13": [
      { nombre: "Salón Rojo", inicio: "08:30", fin: "15:30" },
      { nombre: "Aula Magna Mesa Cierre", inicio: "14:00", fin: "17:00" }
    ],
    "14": [
      { nombre: "Sala de Internalización", inicio: "08:15", fin: "15:30" }
    ],
    "15": [
      { nombre: "Híbrida 602", inicio: "08:15", fin: "13:30" }
    ],
    "16": [
      { nombre: "U-102", inicio: "08:00", fin: "15:30", esSimposio: true }
    ],
    "17": [
      { nombre: "U-103", inicio: "08:00", fin: "15:30", esSimposio: true }
    ],
    "18": [
      { nombre: "U-104", inicio: "08:00", fin: "15:30", esSimposio: true }
    ],
    "19": [
      { nombre: "U-105", inicio: "08:00", fin: "15:30", esSimposio: true }
    ],
    "20": [
      { nombre: "U-201", inicio: "08:00", fin: "15:30", esSimposio: true }
    ],
    "21": [
      { nombre: "U-202", inicio: "08:00", fin: "15:30", esSimposio: true }
    ],
    "22": [
      { nombre: "U-301", inicio: "08:00", fin: "15:30", esSimposio: true }
    ],
    "23": [
      { nombre: "U-302", inicio: "08:00", fin: "15:30", esSimposio: true }
    ],
    "24": [
      { nombre: "U-400", inicio: "08:00", fin: "15:30", esSimposio: true }
    ],
    "25": [
      { nombre: "U-Biblioteca", inicio: "08:00", fin: "15:30", esSimposio: true }
    ],
    "26": [
      { nombre: "U-Sala de Aprendizaje", inicio: "08:00", fin: "15:30", esSimposio: true }
    ]
  }
};

export function getActiveRoom(roomId, day, timeBlock) {
  const dayMap = roomMap[day];
  if (!dayMap || !dayMap[roomId]) return null;

  // Extraer inicio y fin del bloque de horario
  const [blockStart, blockEnd] = timeBlock.split(' - ');

  // Convertir inicio del bloque a minutos
  const [blockStartHour, blockStartMinute] = blockStart.split(':').map(Number);
  const blockStartInMinutes = blockStartHour * 60 + blockStartMinute;

  // Convertir fin del bloque a minutos
  const [blockEndHour, blockEndMinute] = blockEnd.split(':').map(Number);
  const blockEndInMinutes = blockEndHour * 60 + blockEndMinute;

  // Buscar una sala física que cubra TODO el bloque (100 minutos)
  for (const room of dayMap[roomId]) {
    const [startHour, startMinute] = room.inicio.split(':').map(Number);
    const [endHour, endMinute] = room.fin.split(':').map(Number);

    const roomStartInMinutes = startHour * 60 + startMinute;
    const roomEndInMinutes = endHour * 60 + endMinute;

    // Verificar que TANTO el inicio COMO el fin del bloque estén dentro del turno de la sala
    // El bloque debe empezar después (o justo cuando) la sala abre
    // Y debe terminar antes (o justo cuando) la sala cierra
    if (blockStartInMinutes >= roomStartInMinutes && blockEndInMinutes <= roomEndInMinutes) {
      return room;
    }
  }

  return null;
}

export function isSimposioRoom(roomId, day) {
  const roomNum = parseInt(roomId);

  if (day === '14/10') {
    // Martes: salas 22-32 son para simposios
    return roomNum >= 22 && roomNum <= 32;
  } else if (day === '15/10') {
    // Miércoles: salas 16-26 son para simposios
    return roomNum >= 16 && roomNum <= 26;
  }

  // Por defecto, verificar en el mapa si existe el flag esSimposio
  const dayRooms = roomMap[day];
  if (dayRooms && dayRooms[roomId]) {
    const rooms = dayRooms[roomId];
    return rooms.some(room => room.esSimposio === true);
  }

  return false;
}