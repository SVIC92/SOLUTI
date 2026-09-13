import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../database/prisma.service.js';
import { DomainEvent } from '../../../common/events/event-types.js';
import type {
  TicketAssignedPayload,
  TicketCreatedPayload,
  TicketResolvedOrClosedPayload,
  TicketUpdatedPayload,
} from '../../../common/events/event-types.js';
import { NotificationsService } from '../notifications.service.js';

/**
 * Traduce eventos de dominio de Tickets en notificaciones concretas (email + in-app).
 * Este es también el punto donde, en el futuro, el módulo de Encuestas CSAT (Fase 2)
 * engancharía TICKET_CLOSED sin modificar TicketsService.
 */
@Injectable()
export class TicketEventsListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnEvent(DomainEvent.TICKET_CREATED)
  async onTicketCreated(payload: TicketCreatedPayload): Promise<void> {
    // Notifica al propio creador (confirmación) — la asignación a un técnico
    // dispara su propia notificación vía TICKET_ASSIGNED.
    await this.notifications.notify({
      userId: payload.createdById,
      ticketId: payload.ticketId,
      title: 'Ticket creado',
      body: `Tu solicitud "${payload.title}" fue registrada correctamente.`,
      sendEmail: true,
    });
  }

  @OnEvent(DomainEvent.TICKET_ASSIGNED)
  async onTicketAssigned(payload: TicketAssignedPayload): Promise<void> {
    if (!payload.assignedToId) return;

    const ticket = await this.prisma.ticket.findUnique({ where: { id: payload.ticketId } });
    if (!ticket) return;

    await this.notifications.notify({
      userId: payload.assignedToId,
      ticketId: payload.ticketId,
      title: 'Ticket asignado',
      body: `Se te asignó el ticket ${ticket.code}: "${ticket.title}".`,
      sendEmail: true,
    });
  }

  @OnEvent(DomainEvent.TICKET_UPDATED)
  async onTicketUpdated(payload: TicketUpdatedPayload): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: payload.ticketId } });
    if (!ticket) return;

    await this.notifications.notify({
      userId: ticket.createdById,
      ticketId: payload.ticketId,
      title: 'Ticket actualizado',
      body: `Tu ticket ${ticket.code} cambió de ${payload.oldValue} a ${payload.newValue}.`,
      sendEmail: false, // el cierre/resolución sí notifica por email, ver abajo
    });
  }

  @OnEvent(DomainEvent.TICKET_CLOSED)
  async onTicketClosed(payload: TicketResolvedOrClosedPayload): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: payload.ticketId } });
    if (!ticket) return;

    await this.notifications.notify({
      userId: ticket.createdById,
      ticketId: payload.ticketId,
      title: 'Ticket cerrado',
      body: `Tu ticket ${ticket.code} fue cerrado.`,
      sendEmail: true,
    });
  }
}
