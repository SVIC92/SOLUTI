import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service.js';
import { DomainEvent } from '../../common/events/event-types.js';
import type { TicketCommentCreatedPayload } from '../../common/events/event-types.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import type { CreateCommentDto } from './dto/create-comment.dto.js';

const STAFF_ROLES = ['ADMIN', 'TECHNICIAN'];
const SAFE_AUTHOR_SELECT = { id: true, fullName: true, email: true } as const;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  private async assertTicketAccess(ticketId: string, requester: AuthenticatedUser): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { createdById: true },
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket ${ticketId} no encontrado`);
    }
    if (!STAFF_ROLES.includes(requester.role) && ticket.createdById !== requester.sub) {
      throw new ForbiddenException('No tienes acceso a los comentarios de este ticket');
    }
  }

  async create(ticketId: string, dto: CreateCommentDto, requester: AuthenticatedUser) {
    await this.assertTicketAccess(ticketId, requester);

    const isStaff = STAFF_ROLES.includes(requester.role);
    // Un FINAL_USER nunca puede crear una nota interna, sin importar lo que
    // envíe en el body — antes se confiaba ciegamente en `dto.isInternal`.
    const isInternal = isStaff ? (dto.isInternal ?? false) : false;

    const comment = await this.prisma.comment.create({
      data: {
        ticketId,
        authorId: requester.sub,
        body: dto.body,
        isInternal,
      },
    });

    this.events.emit(DomainEvent.TICKET_COMMENT_CREATED, {
      ticketId,
      commentId: comment.id,
      authorId: requester.sub,
      body: comment.body,
      isInternal: comment.isInternal,
    } satisfies TicketCommentCreatedPayload);

    return comment;
  }

  async findForTicket(ticketId: string, requester: AuthenticatedUser) {
    await this.assertTicketAccess(ticketId, requester);
    const isStaff = STAFF_ROLES.includes(requester.role);

    return this.prisma.comment.findMany({
      where: { ticketId, isInternal: isStaff ? undefined : false },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: SAFE_AUTHOR_SELECT } },
    });
  }
}
