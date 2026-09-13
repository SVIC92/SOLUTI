import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service.js';
import { DomainEvent } from '../../common/events/event-types.js';
import type { CsatSurveySubmittedPayload } from '../../common/events/event-types.js';
import type { SubmitSurveyResponseDto } from './dto/submit-survey-response.dto.js';

/**
 * Encuestas de Satisfacción / CSAT (plan `1.txt`, Fase 2): al cerrar un ticket
 * (ver `SurveyEventsListener`, que escucha `ticket.closed`) se crea automáticamente
 * una encuesta pendiente de 1 clic; el usuario que abrió el ticket la responde.
 */
@Injectable()
export class SurveysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** Crea la encuesta pendiente para un ticket recién cerrado (idempotente). */
  createForTicket(ticketId: string) {
    return this.prisma.survey.upsert({
      where: { ticketId },
      update: {},
      create: { ticketId },
    });
  }

  async findByTicket(ticketId: string, requesterId: string, requesterRole: string) {
    const survey = await this.prisma.survey.findUnique({
      where: { ticketId },
      include: { ticket: { select: { createdById: true, code: true, title: true } } },
    });
    if (!survey) {
      throw new NotFoundException(`No hay encuesta CSAT para el ticket ${ticketId}`);
    }
    if (survey.ticket.createdById !== requesterId && requesterRole === 'FINAL_USER') {
      throw new ForbiddenException('Solo el solicitante del ticket puede ver esta encuesta');
    }
    return survey;
  }

  async submitResponse(ticketId: string, dto: SubmitSurveyResponseDto, requesterId: string) {
    const survey = await this.prisma.survey.findUnique({
      where: { ticketId },
      include: { ticket: { select: { createdById: true } } },
    });
    if (!survey) {
      throw new NotFoundException(`No hay encuesta CSAT pendiente para el ticket ${ticketId}`);
    }
    if (survey.ticket.createdById !== requesterId) {
      throw new ForbiddenException('Solo quien solicitó el ticket puede responder su encuesta');
    }
    if (survey.respondedAt) {
      throw new BadRequestException('Esta encuesta ya fue respondida');
    }

    const updated = await this.prisma.survey.update({
      where: { ticketId },
      data: { score: dto.score, comment: dto.comment, respondedAt: new Date() },
    });

    this.events.emit(DomainEvent.CSAT_SURVEY_SUBMITTED, {
      ticketId,
      score: dto.score,
      comment: dto.comment ?? null,
    } satisfies CsatSurveySubmittedPayload);

    return updated;
  }

  findAll() {
    return this.prisma.survey.findMany({
      include: { ticket: { select: { code: true, title: true } } },
      orderBy: { sentAt: 'desc' },
    });
  }

  /** Métricas agregadas para el panel de reportes (promedio, distribución, tasa de respuesta). */
  async getStats() {
    const surveys = await this.prisma.survey.findMany({ select: { score: true, respondedAt: true } });
    const responded = surveys.filter((s) => s.respondedAt !== null);
    const average =
      responded.length === 0
        ? null
        : responded.reduce((sum, s) => sum + (s.score ?? 0), 0) / responded.length;

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const s of responded) {
      if (s.score) distribution[s.score] = (distribution[s.score] ?? 0) + 1;
    }

    return {
      totalSent: surveys.length,
      totalResponded: responded.length,
      responseRate: surveys.length === 0 ? 0 : responded.length / surveys.length,
      averageScore: average,
      distribution,
    };
  }
}
