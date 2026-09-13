import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { TicketPriority } from '../../generated/prisma/enums.js';
import type { UpsertSlaPolicyDto } from './dto/upsert-sla-policy.dto.js';

export interface SlaStatus {
  policy: { firstResponseMins: number; resolutionMins: number } | null;
  firstResponseDeadline: Date | null;
  resolutionDeadline: Date | null;
  firstResponseBreached: boolean;
  resolutionBreached: boolean;
  resolutionMinutesRemaining: number | null;
}

/**
 * Gestión de Acuerdos de Nivel de Servicio (plan `1.txt`, Fase 2): define tiempos
 * límite de respuesta/resolución por prioridad y calcula el estado de cumplimiento
 * de un ticket concreto. El cron `sla-checker.job.ts` reutiliza `computeStatus`
 * para alertar antes de que un ticket incumpla su SLA.
 */
@Injectable()
export class SlaService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.slaPolicy.findMany({ orderBy: { priority: 'asc' } });
  }

  upsert(dto: UpsertSlaPolicyDto) {
    return this.prisma.slaPolicy.upsert({
      where: { priority: dto.priority },
      update: { firstResponseMins: dto.firstResponseMins, resolutionMins: dto.resolutionMins },
      create: dto,
    });
  }

  getPolicyFor(priority: TicketPriority) {
    return this.prisma.slaPolicy.findUnique({ where: { priority } });
  }

  /** Calcula deadlines y si un ticket ya incumplió su SLA de primera respuesta/resolución. */
  computeStatus(ticket: {
    priority: TicketPriority;
    createdAt: Date;
    firstResponseAt: Date | null;
    resolvedAt: Date | null;
    closedAt: Date | null;
    slaPolicy: { firstResponseMins: number; resolutionMins: number } | null;
  }): SlaStatus {
    if (!ticket.slaPolicy) {
      return {
        policy: null,
        firstResponseDeadline: null,
        resolutionDeadline: null,
        firstResponseBreached: false,
        resolutionBreached: false,
        resolutionMinutesRemaining: null,
      };
    }

    const firstResponseDeadline = new Date(
      ticket.createdAt.getTime() + ticket.slaPolicy.firstResponseMins * 60_000,
    );
    const resolutionDeadline = new Date(ticket.createdAt.getTime() + ticket.slaPolicy.resolutionMins * 60_000);
    const isClosed = Boolean(ticket.resolvedAt || ticket.closedAt);
    const now = new Date();

    const firstResponseBreached = !ticket.firstResponseAt && now > firstResponseDeadline;
    const resolutionBreached = !isClosed && now > resolutionDeadline;
    const resolutionMinutesRemaining = isClosed
      ? null
      : Math.round((resolutionDeadline.getTime() - now.getTime()) / 60_000);

    return {
      policy: ticket.slaPolicy,
      firstResponseDeadline,
      resolutionDeadline,
      firstResponseBreached,
      resolutionBreached,
      resolutionMinutesRemaining,
    };
  }

  /** Usado por el cron: tickets abiertos cuyo SLA de resolución vence en <= `withinMins`. */
  async findTicketsNearingBreach(withinMins: number) {
    const openTickets = await this.prisma.ticket.findMany({
      where: {
        status: { in: ['NEW', 'IN_PROGRESS', 'ON_HOLD'] },
        slaPolicyId: { not: null },
      },
      include: { slaPolicy: true },
    });

    const now = Date.now();
    return openTickets.filter((ticket) => {
      if (!ticket.slaPolicy) return false;
      const deadline = ticket.createdAt.getTime() + ticket.slaPolicy.resolutionMins * 60_000;
      const minutesRemaining = (deadline - now) / 60_000;
      return minutesRemaining <= withinMins;
    });
  }
}
