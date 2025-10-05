/**
 * Event Model
 * Represents a single event in the conference schedule
 */

import { EVENT_STATUS } from '../constants.js';

export class Event {
  constructor(data = {}) {
    this.id = data.id || null;
    this.titulo = data.titulo || '';
    this.autores = data.autores || '';
    this.afiliacion = data.afiliacion || '';
    this.dia = data.dia || '';
    this.hora = data.hora || '';
    this.sala = data.sala || '';
    this.tipo = data.tipo || '';
    this.eje = data.eje || '';
    this.resumen = data.resumen || '';
    this.estado = data.estado || EVENT_STATUS.DRAFT;
    this.palabrasClave = data.palabras_clave || data.palabrasClave || '';
    this.created_at = data.created_at || null;
    this.updated_at = data.updated_at || null;
  }

  /**
   * Check if event is published
   */
  isPublished() {
    return this.estado === EVENT_STATUS.PUBLISHED;
  }

  /**
   * Check if event is draft
   */
  isDraft() {
    return this.estado === EVENT_STATUS.DRAFT;
  }

  /**
   * Get formatted time
   */
  getFormattedTime() {
    return this.hora || 'Sin hora';
  }

  /**
   * Get formatted day
   */
  getFormattedDay() {
    return this.dia ? `Día ${this.dia}` : 'Sin día';
  }

  /**
   * Check if event matches filters
   */
  matchesFilters(filters = {}) {
    if (filters.day && this.dia !== filters.day) return false;
    if (filters.time && this.hora !== filters.time) return false;
    if (filters.room && this.sala !== filters.room) return false;
    if (filters.type && this.tipo !== filters.type) return false;
    if (filters.eje && this.eje !== filters.eje) return false;
    return true;
  }

  /**
   * Check if event matches search query
   */
  matchesSearch(query = '') {
    if (!query) return true;

    const searchLower = query.toLowerCase();
    const searchableFields = [
      this.titulo,
      this.autores,
      this.afiliacion,
      this.resumen,
      this.palabrasClave,
      this.eje,
      this.tipo,
    ];

    return searchableFields.some(field =>
      field && field.toLowerCase().includes(searchLower)
    );
  }

  /**
   * Convert to API format
   */
  toApiFormat() {
    return {
      id: this.id,
      titulo: this.titulo,
      autores: this.autores,
      afiliacion: this.afiliacion,
      dia: this.dia,
      hora: this.hora,
      sala: this.sala,
      tipo: this.tipo,
      eje: this.eje,
      resumen: this.resumen,
      estado: this.estado,
      palabras_clave: this.palabrasClave,
    };
  }

  /**
   * Validate event data
   */
  validate() {
    const errors = [];

    if (!this.titulo || this.titulo.trim() === '') {
      errors.push('El título es requerido');
    }

    if (!this.autores || this.autores.trim() === '') {
      errors.push('Los autores son requeridos');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clone event
   */
  clone() {
    return new Event({
      ...this.toApiFormat(),
      id: null, // Remove ID for new event
    });
  }
}
