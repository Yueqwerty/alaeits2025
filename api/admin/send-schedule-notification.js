/**
 * Servicio para enviar notificaciones de cambios de horario por correo electrónico
 *
 * Este servicio envía notificaciones a los participantes cuando hay cambios
 * en los horarios o salas de sus eventos
 */
require('dotenv').config({ path: '../../.env.local' });
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

// Conexión a la base de datos
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Configuración del transportador de correo electrónico
 * Para pruebas, puedes usar servicios como Mailtrap o Ethereal
 * Para producción, configura tus credenciales SMTP reales
 */
const createTransporter = () => {
  // Para desarrollo, usa una cuenta de prueba de Ethereal
  if (process.env.NODE_ENV !== 'production') {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  // Para producción, usa tus credenciales reales
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

/**
 * Envía notificaciones cuando hay cambios en la programación de un evento
 * @param {string} eventId - ID del evento que ha sido modificado
 * @param {Object} changes - Objeto con los cambios realizados (día, horario, sala)
 * @returns {Promise<Object>} - Resultado del envío de notificaciones
 */
async function sendScheduleNotification(eventId, changes) {
  const client = await pool.connect();
  try {
    // Obtener información del evento y correos electrónicos
    const { rows } = await client.query(`
      SELECT id, title, emails, scheduled_day, scheduled_time_block, room
      FROM events
      WHERE id = $1
    `, [eventId]);

    if (rows.length === 0) {
      throw new Error(`No se encontró el evento con ID: ${eventId}`);
    }

    const event = rows[0];
    const emailsList = event.emails?.es?.split(', ') || [];

    if (emailsList.length === 0) {
      console.log(`No hay correos electrónicos registrados para el evento ${eventId}`);
      return { success: false, message: 'No hay correos electrónicos para notificar' };
    }

    // Preparar el contenido del correo
    const subject = 'ALAEITS 2025 - Cambio en la programación de su ponencia';
    const htmlContent = `
      <h1>Cambio en la programación de su ponencia</h1>
      <p>Estimado(a) participante,</p>
      <p>Le informamos que ha habido un cambio en la programación de su ponencia en ALAEITS 2025:</p>

      <div style="margin: 20px 0; padding: 15px; border-left: 4px solid #C8102E; background-color: #f9f9f9;">
        <h3 style="color: #002147; margin-top: 0;">${event.title.es}</h3>
        <p><strong>ID:</strong> ${event.id}</p>

        ${changes.scheduled_day ? `
          <p><strong>Día:</strong>
            <span style="text-decoration: line-through;">${changes.old_day}</span> →
            <span style="font-weight: bold; color: #C8102E;">${changes.scheduled_day}</span>
          </p>
        ` : ''}

        ${changes.scheduled_time_block ? `
          <p><strong>Horario:</strong>
            <span style="text-decoration: line-through;">${changes.old_time}</span> →
            <span style="font-weight: bold; color: #C8102E;">${changes.scheduled_time_block}</span>
          </p>
        ` : ''}

        ${changes.room ? `
          <p><strong>Sala:</strong>
            <span style="text-decoration: line-through;">${changes.old_room}</span> →
            <span style="font-weight: bold; color: #C8102E;">${changes.room}</span>
          </p>
        ` : ''}
      </div>

      <p>Por favor, tome nota de este cambio para su participación.</p>
      <p>Si tiene alguna pregunta, no dude en contactarnos.</p>

      <p>Atentamente,<br>Comité Organizador ALAEITS 2025</p>
    `;

    // Enviar correo a cada destinatario
    const transporter = createTransporter();
    const results = await Promise.all(
      emailsList.map(email =>
        transporter.sendMail({
          from: `"ALAEITS 2025" <${process.env.EMAIL_FROM || 'notificaciones@alaeits2025.cl'}>`,
          to: email.trim(),
          subject,
          html: htmlContent
        })
      )
    );

    console.log(`✅ Notificaciones enviadas para el evento ${eventId}`);
    return {
      success: true,
      message: `Se enviaron ${results.length} notificaciones`,
      results
    };

  } catch (error) {
    console.error(`❌ Error enviando notificaciones para el evento ${eventId}:`, error);
    return {
      success: false,
      message: error.message,
      error
    };
  } finally {
    client.release();
  }
}

/**
 * Notifica a todos los participantes de una mesa cuando hay cambios en la programación
 * @param {string} mesaId - ID de la mesa que ha sido modificada
 * @param {Object} changes - Objeto con los cambios realizados (día, horario, sala)
 * @returns {Promise<Object>} - Resultado del envío de notificaciones
 */
async function notifyMesaParticipants(mesaId, changes) {
  const client = await pool.connect();
  try {
    // Obtener todos los eventos de la mesa
    const { rows: mesaEvents } = await client.query(`
      SELECT id FROM events WHERE mesa_id = $1
    `, [mesaId]);

    if (mesaEvents.length === 0) {
      throw new Error(`No se encontraron eventos para la mesa ${mesaId}`);
    }

    // Enviar notificaciones para cada evento
    const results = await Promise.all(
      mesaEvents.map(event => sendScheduleNotification(event.id, changes))
    );

    console.log(`✅ Notificaciones enviadas para ${results.length} eventos de la mesa ${mesaId}`);
    return {
      success: true,
      message: `Se procesaron notificaciones para ${results.length} eventos`,
      results
    };

  } catch (error) {
    console.error(`❌ Error enviando notificaciones para la mesa ${mesaId}:`, error);
    return {
      success: false,
      message: error.message,
      error
    };
  } finally {
    client.release();
  }
}

// Si se ejecuta directamente, mostrar instrucciones
if (require.main === module) {
  console.log(`
    📧 Servicio de notificaciones ALAEITS 2025

    Este script debe ser importado y utilizado desde los endpoints de API
    que manejan cambios en la programación.

    Ejemplo de uso:
      const { sendScheduleNotification, notifyMesaParticipants } = require('./send-schedule-notification');

      // Para notificar un evento individual
      await sendScheduleNotification('P123', {
        scheduled_day: 'martes 14 de octubre',
        old_day: 'miércoles 15 de octubre'
      });

      // Para notificar todos los eventos de una mesa
      await notifyMesaParticipants('M45', {
        room: 'SALA 103-A',
        old_room: 'SALA 101'
      });
  `);
}

module.exports = {
  sendScheduleNotification,
  notifyMesaParticipants
};