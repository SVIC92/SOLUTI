import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../database/prisma.service.js';
import { DomainEvent } from '../../../common/events/event-types.js';
import type { TicketResolvedOrClosedPayload } from '../../../common/events/event-types.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { SurveysService } from '../surveys.service.js';

/**
 * Al cerrar un ticket (plan `1.txt`, Fase 2 — CSAT): crea la encuesta pendiente y
 * notifica al solicitante para que la responda en un clic. Reutiliza el mismo
 * pipeline de notificaciones (email + in-app) que el resto del sistema.
 */
@Injectable()
export class SurveyEventsListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly surveysService: SurveysService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnEvent(DomainEvent.TICKET_CLOSED)
  async onTicketClosed(payload: TicketResolvedOrClosedPayload): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: payload.ticketId } });
    if (!ticket) return;

    await this.surveysService.createForTicket(ticket.id);

    await this.notifications.notify({
      userId: ticket.createdById,
      ticketId: ticket.id,
      title: '¿Cómo fue tu experiencia?',
      body: `Tu ticket ${ticket.code} fue cerrado. Califica la atención recibida en un clic.`,
      sendEmail: true,
    });
  }
}
