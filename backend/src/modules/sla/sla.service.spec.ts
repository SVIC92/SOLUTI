import { describe, expect, it } from 'vitest';
import { SlaService } from './sla.service.js';

/**
 * `computeStatus` es lógica pura (no toca Prisma), así que se prueba de forma
 * aislada instanciando el servicio sin una conexión real a base de datos.
 */
describe('SlaService.computeStatus', () => {
  const service = new SlaService(null as never);

  function minutesAgo(minutes: number): Date {
    return new Date(Date.now() - minutes * 60_000);
  }

  it('devuelve todo en null/false cuando el ticket no tiene política de SLA asignada', () => {
    const status = service.computeStatus({
      priority: 'MEDIUM',
      createdAt: minutesAgo(10),
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
      slaPolicy: null,
    });

    expect(status.policy).toBeNull();
    expect(status.firstResponseBreached).toBe(false);
    expect(status.resolutionBreached).toBe(false);
    expect(status.resolutionMinutesRemaining).toBeNull();
  });

  it('no marca incumplimiento cuando el ticket todavía está dentro de los plazos', () => {
    const status = service.computeStatus({
      priority: 'HIGH',
      createdAt: minutesAgo(10),
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
      slaPolicy: { firstResponseMins: 30, resolutionMins: 240 },
    });

    expect(status.firstResponseBreached).toBe(false);
    expect(status.resolutionBreached).toBe(false);
    // Creado hace 10 min, resolución límite en 240 min → quedan ~230 min.
    expect(status.resolutionMinutesRemaining).toBeGreaterThan(220);
    expect(status.resolutionMinutesRemaining).toBeLessThanOrEqual(230);
  });

  it('marca incumplimiento de primera respuesta cuando ya pasó el plazo y nadie respondió', () => {
    const status = service.computeStatus({
      priority: 'CRITICAL',
      createdAt: minutesAgo(90),
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
      slaPolicy: { firstResponseMins: 15, resolutionMins: 240 },
    });

    expect(status.firstResponseBreached).toBe(true);
    // La resolución (240 min) todavía no vence a los 90 min transcurridos.
    expect(status.resolutionBreached).toBe(false);
  });

  it('marca incumplimiento de resolución cuando el ticket sigue abierto tras el plazo', () => {
    const status = service.computeStatus({
      priority: 'CRITICAL',
      createdAt: minutesAgo(300),
      firstResponseAt: minutesAgo(280),
      resolvedAt: null,
      closedAt: null,
      slaPolicy: { firstResponseMins: 15, resolutionMins: 240 },
    });

    expect(status.firstResponseBreached).toBe(false); // sí respondió, aunque tarde
    expect(status.resolutionBreached).toBe(true);
    expect(status.resolutionMinutesRemaining).toBeLessThan(0);
  });

  it('no marca incumplimiento de resolución si el ticket ya está resuelto, aunque haya pasado el plazo', () => {
    const status = service.computeStatus({
      priority: 'LOW',
      createdAt: minutesAgo(500),
      firstResponseAt: minutesAgo(490),
      resolvedAt: minutesAgo(10),
      closedAt: null,
      slaPolicy: { firstResponseMins: 15, resolutionMins: 240 },
    });

    expect(status.resolutionBreached).toBe(false);
    expect(status.resolutionMinutesRemaining).toBeNull();
  });
});
