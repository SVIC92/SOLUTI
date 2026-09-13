import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SlaService } from '../modules/sla/sla.service.js';
import { NotificationsService } from '../modules/notifications/notifications.service.js';

const WARNING_WINDOW_MINS = 30; // alerta cuando falten <= 30 min para vencer el SLA de resolución

/**
 * Cron job (plan `1.txt`, Fase 2 — Gestión de SLA): revisa periódicamente los
 * tickets abiertos y notifica al técnico asignado cuando su SLA de resolución
 * está a punto de vencer. Reutiliza el mismo pipeline de notificaciones que el
 * resto del sistema (email + in-app).
 */
@Injectable()
export class SlaCheckerJob {
  private readonly logger = new Logger(SlaCheckerJob.name);

  constructor(
    private readonly slaService: SlaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkSlaBreaches(): Promise<void> {
    const atRiskTickets = await this.slaService.findTicketsNearingBreach(WARNING_WINDOW_MINS);
    if (atRiskTickets.length === 0) return;

    this.logger.log(`${atRiskTickets.length} ticket(s) próximos a vencer su SLA de resolución`);

    for (const ticket of atRiskTickets) {
      if (!ticket.assignedToId) continue; // sin técnico asignado, nada que notificar todavía

      await this.notifications.notify({
        userId: ticket.assignedToId,
        ticketId: ticket.id,
        title: 'SLA próximo a vencer',
        body: `El ticket ${ticket.code} está a menos de ${WARNING_WINDOW_MINS} minutos de incumplir su SLA de resolución.`,
        sendEmail: true,
      });
    }
  }
}
