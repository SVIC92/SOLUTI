import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Redis } from 'ioredis';
import { DomainEvent, type DomainEventType } from '../../common/events/event-types.js';

export const AI_EVENT_STREAM = 'core-events'; // debe coincidir con STREAM_NAME en ai-service/app/core/event_bus.py

/**
 * Republica TODOS los eventos de dominio del core hacia Redis Streams, para que
 * services/ai-service los consuma de forma asíncrona (triaje, embeddings, anomalías,
 * KB drafts) sin acoplar el núcleo al servicio de IA. Ver plan, secciones 3 y 9.
 *
 * Si Redis no está disponible, se registra el error pero NO se relanza: el core debe
 * seguir funcionando sin metadatos de IA (modo degradado descrito en el plan de IA).
 */
@Injectable()
export class AiEventPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(AiEventPublisher.name);
  private readonly redis: Redis;

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis(this.config.get<string>('REDIS_URL', 'redis://redis:6379'), {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
  }

  private async publish(type: DomainEventType, payload: unknown): Promise<void> {
    try {
      await this.redis.xadd(AI_EVENT_STREAM, '*', 'type', type, 'payload', JSON.stringify(payload));
    } catch (error) {
      this.logger.warn(
        `No se pudo publicar el evento '${type}' hacia ai-service (modo degradado): ${(error as Error).message}`,
      );
    }
  }

  @OnEvent(DomainEvent.TICKET_CREATED)
  onTicketCreated(payload: unknown) {
    return this.publish(DomainEvent.TICKET_CREATED, payload);
  }

  @OnEvent(DomainEvent.TICKET_COMMENT_CREATED)
  onTicketCommentCreated(payload: unknown) {
    return this.publish(DomainEvent.TICKET_COMMENT_CREATED, payload);
  }

  @OnEvent(DomainEvent.TICKET_UPDATED)
  onTicketUpdated(payload: unknown) {
    return this.publish(DomainEvent.TICKET_UPDATED, payload);
  }

  @OnEvent(DomainEvent.TICKET_ASSIGNED)
  onTicketAssigned(payload: unknown) {
    return this.publish(DomainEvent.TICKET_ASSIGNED, payload);
  }

  @OnEvent(DomainEvent.TICKET_RESOLVED)
  onTicketResolved(payload: unknown) {
    return this.publish(DomainEvent.TICKET_RESOLVED, payload);
  }

  @OnEvent(DomainEvent.TICKET_CLOSED)
  onTicketClosed(payload: unknown) {
    return this.publish(DomainEvent.TICKET_CLOSED, payload);
  }

  @OnEvent(DomainEvent.CSAT_SURVEY_SUBMITTED)
  onCsatSurveySubmitted(payload: unknown) {
    return this.publish(DomainEvent.CSAT_SURVEY_SUBMITTED, payload);
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }
}
