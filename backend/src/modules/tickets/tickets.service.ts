import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { DomainEvent } from '../../common/events/event-types.js';
import type {
  CmdbAssetLinkedPayload,
  TicketAssignedPayload,
  TicketCreatedPayload,
  TicketResolvedOrClosedPayload,
  TicketUpdatedPayload,
} from '../../common/events/event-types.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import type { TicketPriority } from '../../generated/prisma/enums.js';
import { AutomationService } from '../automation/automation.service.js';
import { SlaService } from '../sla/sla.service.js';
import { UsersService } from '../users/users.service.js';
import type { AssignTicketDto } from './dto/assign-ticket.dto.js';
import type { CreateTicketDto } from './dto/create-ticket.dto.js';
import type { UpdateAiMetadataDto } from './dto/update-ai-metadata.dto.js';
import type { UpdateTicketDto } from './dto/update-ticket.dto.js';

// El Usuario Final (plan `1.txt`) solo "solicita ayuda y ve el estado de sus
// tickets" — nunca los de otros usuarios. Técnicos/Admin ven todo.
const STAFF_ROLES = ['ADMIN', 'TECHNICIAN'];

// Campos seguros de User a exponer en las relaciones de un ticket — nunca
// `passwordHash` ni otros campos sensibles (antes se filtraban por `include: true`).
const SAFE_USER_SELECT = { id: true, fullName: true, email: true } as const;

/**
 * Módulo central del Help Desk. Toda mutación de un ticket:
 *  1. Persiste el cambio (y, cuando aplica, una fila en TicketHistory).
 *  2. Emite un evento de dominio (EventEmitter2) consumido por:
 *     - notifications/listeners (email + in-app), y
 *     - ai-gateway/event-publisher (republica a Redis Streams para ai-service).
 * Ver plan, secciones 3 y 9 — los campos `ai*` de Ticket son de solo lectura aquí:
 * el core nunca los calcula, solo los expone.
 */
@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly slaService: SlaService,
    private readonly automationService: AutomationService,
    private readonly usersService: UsersService,
  ) {}

  private async generateTicketCode(): Promise<string> {
    // Secuencia legible simple (TCK-000123), con reintento ante colisión: `code`
    // es @unique en el schema, y bajo creaciones concurrentes dos requests pueden
    // calcular el mismo valor (el conteo no es atómico). En vez de fallar con un
    // 500 por violación de unicidad, se reintenta con un nuevo jitter.
    const count = await this.prisma.ticket.count();
    const next = count + 1 + randomInt(0, 1000);
    return `TCK-${String(next).padStart(6, '0')}`;
  }

  private async createWithUniqueCode(data: {
    title: string;
    description: string;
    categoryId: string;
    priority: TicketPriority;
    createdById: string;
    slaPolicyId?: string;
    assignedToId?: string;
    assignedGroupId?: string;
  }) {
    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = await this.generateTicketCode();
      try {
        return await this.prisma.ticket.create({ data: { ...data, code } });
      } catch (error) {
        const isUniqueViolation = (error as { code?: string }).code === 'P2002';
        if (!isUniqueViolation || attempt === MAX_ATTEMPTS - 1) throw error;
        // Colisión de código con otra creación concurrente: reintenta con otro jitter.
      }
    }
    throw new Error('No se pudo generar un código de ticket único tras varios intentos');
  }

  async create(dto: CreateTicketDto, createdById: string) {
    const priority = dto.priority ?? 'MEDIUM';
    // Asigna la política de SLA vigente para esa prioridad (si un admin la configuró);
    // sin política definida, el ticket queda sin deadlines (ver SlaService.computeStatus).
    const slaPolicy = await this.slaService.getPolicyFor(priority);
    // Enrutamiento automático por categoría (plan `1.txt`, Fase 2): si hay una regla
    // activa para esta categoría, el ticket nace ya asignado a su técnico/grupo.
    const autoAssignment = await this.automationService.findActiveRuleFor(dto.categoryId);

    const ticket = await this.createWithUniqueCode({
      title: dto.title,
      description: dto.description,
      categoryId: dto.categoryId,
      priority,
      createdById,
      slaPolicyId: slaPolicy?.id,
      assignedToId: autoAssignment?.assignedToId,
      assignedGroupId: autoAssignment?.assignedGroupId,
    });

    const payload: TicketCreatedPayload = {
      ticketId: ticket.id,
      title: ticket.title,
      description: ticket.description,
      createdById: ticket.createdById,
      categoryId: ticket.categoryId,
    };
    this.events.emit(DomainEvent.TICKET_CREATED, payload);

    if (autoAssignment?.assignedToId || autoAssignment?.assignedGroupId) {
      await this.prisma.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          changedById: createdById,
          field: 'assignedTo',
          oldValue: null,
          newValue: autoAssignment.assignedToId ?? autoAssignment.assignedGroupId ?? null,
        },
      });

      this.events.emit(DomainEvent.TICKET_ASSIGNED, {
        ticketId: ticket.id,
        assignedToId: autoAssignment.assignedToId ?? null,
        assignedGroupId: autoAssignment.assignedGroupId ?? null,
      } satisfies TicketAssignedPayload);
    }

    return ticket;
  }

  /**
   * Lista tickets. Un Usuario Final (`FINAL_USER`) SOLO ve los suyos —
   * el scoping se fuerza aquí, no confía en que el llamador filtre bien.
   */
  findAll(filters: { status?: string; priority?: string; assignedToId?: string }, requester: AuthenticatedUser) {
    const isStaff = STAFF_ROLES.includes(requester.role);

    return this.prisma.ticket.findMany({
      where: {
        status: filters.status as never,
        priority: filters.priority as never,
        assignedToId: isStaff ? filters.assignedToId : undefined,
        createdById: isStaff ? undefined : requester.sub,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        category: true,
        assignedTo: { select: SAFE_USER_SELECT },
        createdBy: { select: SAFE_USER_SELECT },
      },
    });
  }

  /**
   * Detalle de un ticket. Un `FINAL_USER` solo puede ver tickets que él mismo
   * creó — cualquier otro intento es un 403, no un 404 (para no filtrar por
   * timing si el ticket existe o no).
   */
  async findOne(id: string, requester?: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        category: true,
        assignedTo: { select: SAFE_USER_SELECT },
        createdBy: { select: SAFE_USER_SELECT },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: SAFE_USER_SELECT } },
        },
        attachments: true,
        history: { orderBy: { createdAt: 'asc' } },
        slaPolicy: true,
        asset: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket ${id} no encontrado`);
    }

    const isStaff = !!requester && STAFF_ROLES.includes(requester.role);

    if (requester && !isStaff && ticket.createdById !== requester.sub) {
      throw new ForbiddenException('No tienes acceso a este ticket');
    }

    // Un FINAL_USER nunca debe ver notas internas del equipo de soporte, aunque
    // este `findOne` también se reutiliza internamente (update/assign/linkAsset)
    // sin `requester` — en ese caso no se filtra, ya que no es una respuesta HTTP.
    if (requester && !isStaff) {
      return { ...ticket, comments: ticket.comments.filter((c) => !c.isInternal) };
    }

    return ticket;
  }

  async update(id: string, dto: UpdateTicketDto, changedById: string) {
    const current = await this.findOne(id);
    const data: Record<string, unknown> = {};

    if (dto.status && dto.status !== current.status) {
      data.status = dto.status;
      if (dto.status === 'RESOLVED') data.resolvedAt = new Date();
      if (dto.status === 'CLOSED') data.closedAt = new Date();
    }
    if (dto.priority && dto.priority !== current.priority) {
      data.priority = dto.priority;
      // Re-sincroniza la política de SLA vigente para la nueva prioridad.
      const slaPolicy = await this.slaService.getPolicyFor(dto.priority);
      data.slaPolicyId = slaPolicy?.id ?? null;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({ where: { id }, data });

      for (const field of ['status', 'priority'] as const) {
        if (field in data) {
          await tx.ticketHistory.create({
            data: {
              ticketId: id,
              changedById,
              field,
              oldValue: String(current[field]),
              newValue: String(data[field]),
            },
          });
        }
      }

      return ticket;
    });

    // Se emite ante CUALQUIER cambio persistido (antes solo se emitía si venía
    // `status`, así que un cambio de prioridad a solas no notificaba a nadie ni
    // llegaba a ai-service vía Redis Streams).
    if ('status' in data || 'priority' in data) {
      const payload: TicketUpdatedPayload = {
        ticketId: id,
        field: 'status' in data ? 'status' : 'priority',
        oldValue: 'status' in data ? current.status : current.priority,
        newValue: 'status' in data ? (dto.status as string) : (dto.priority as string),
        changedById,
      };
      this.events.emit(DomainEvent.TICKET_UPDATED, payload);

      if (dto.status === 'RESOLVED') {
        this.events.emit(DomainEvent.TICKET_RESOLVED, {
          ticketId: id,
          resolvedAt: updated.resolvedAt,
        } satisfies TicketResolvedOrClosedPayload);
      }
      if (dto.status === 'CLOSED') {
        this.events.emit(DomainEvent.TICKET_CLOSED, {
          ticketId: id,
          closedAt: updated.closedAt,
        } satisfies TicketResolvedOrClosedPayload);
      }
    }

    return updated;
  }

  async assign(id: string, dto: AssignTicketDto, changedById: string) {
    const current = await this.findOne(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({
        where: { id },
        data: {
          assignedToId: dto.assignedToId,
          assignedGroupId: dto.assignedGroupId,
        },
      });

      await tx.ticketHistory.create({
        data: {
          ticketId: id,
          changedById,
          field: 'assignedTo',
          oldValue: current.assignedToId,
          // Antes se registraba `dto.assignedToId ?? null`: si el DTO solo traía
          // `assignedGroupId` (sin tocar el técnico), quedaba escrito "sin técnico"
          // en el historial aunque en BD siguiera asignado al técnico anterior.
          newValue: ticket.assignedToId,
        },
      });

      return ticket;
    });

    const payload: TicketAssignedPayload = {
      ticketId: id,
      // Mismo fix: se reporta el estado real ya persistido, no el DTO crudo.
      assignedToId: updated.assignedToId,
      assignedGroupId: updated.assignedGroupId,
    };
    this.events.emit(DomainEvent.TICKET_ASSIGNED, payload);

    return updated;
  }

  /** Vincula el ticket a un activo del CMDB (plan `1.txt`, Fase 2). */
  async linkAsset(id: string, assetId: string, changedById: string) {
    const current = await this.findOne(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({ where: { id }, data: { assetId } });

      await tx.ticketHistory.create({
        data: {
          ticketId: id,
          changedById,
          field: 'assetId',
          oldValue: current.assetId,
          newValue: assetId,
        },
      });

      return ticket;
    });

    this.events.emit(DomainEvent.CMDB_ASSET_LINKED_TO_TICKET, {
      ticketId: id,
      assetId,
      changedById,
    } satisfies CmdbAssetLinkedPayload);

    return updated;
  }

  /** Estado de cumplimiento de SLA del ticket (deadlines + si ya incumplió). */
  async getSlaStatus(id: string, requester?: AuthenticatedUser) {
    const ticket = await this.findOne(id, requester);
    return this.slaService.computeStatus(ticket);
  }

  /**
   * Escribe de vuelta los metadatos calculados por ai-service (plan `2.txt`,
   * módulos 1 y 5). Llamado desde `internal/ai/tickets/:id/classification`
   * (autenticado por API key de servicio, no por JWT de usuario).
   */
  async updateAiMetadata(id: string, dto: UpdateAiMetadataDto) {
    const current = await this.findOne(id);
    const data: Record<string, unknown> = {};

    if (dto.aiSuggestedCategory !== undefined) data.aiSuggestedCategory = dto.aiSuggestedCategory;
    if (dto.aiSuggestedPriority !== undefined) data.aiSuggestedPriority = dto.aiSuggestedPriority;
    if (dto.aiSentimentScore !== undefined) data.aiSentimentScore = dto.aiSentimentScore;
    if (dto.aiSummary !== undefined) data.aiSummary = dto.aiSummary;
    if (dto.aiEtaMinutes !== undefined) data.aiEtaMinutes = dto.aiEtaMinutes;

    const updated = await this.prisma.ticket.update({ where: { id }, data });

    // Enrutamiento inteligente: solo auto-asigna si nadie lo asignó ya a mano.
    if (dto.autoAssignToId && !current.assignedToId) {
      const aiUserId = await this.usersService.findOrCreateAiServiceUser();
      await this.assign(id, { assignedToId: dto.autoAssignToId }, aiUserId);
    }

    return updated;
  }
}
