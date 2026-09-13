/**
 * Nombres y payloads de los eventos de dominio emitidos por el core vía EventEmitter2.
 * Estos mismos eventos se republican en Redis Streams (ver ai-gateway/event-publisher.ts)
 * para que services/ai-service los consuma sin acoplarse a los servicios del core.
 *
 * Ver plan, sección 3 y 9 (puntos de extensión de IA).
 */
export const DomainEvent = {
  TICKET_CREATED: 'ticket.created',
  TICKET_COMMENT_CREATED: 'ticket.comment.created',
  TICKET_UPDATED: 'ticket.updated',
  TICKET_ASSIGNED: 'ticket.assigned',
  TICKET_RESOLVED: 'ticket.resolved',
  TICKET_CLOSED: 'ticket.closed',
  TECHNICIAN_WORKLOAD_CHANGED: 'technician.workload.changed',
  TECHNICIAN_SKILLS_UPDATED: 'technician.skills.updated',
  CMDB_ASSET_LINKED_TO_TICKET: 'cmdb.asset.linked_to_ticket',
  CSAT_SURVEY_SUBMITTED: 'csat.survey.submitted',
} as const;

export type DomainEventType = (typeof DomainEvent)[keyof typeof DomainEvent];

export interface TicketCreatedPayload {
  ticketId: string;
  title: string;
  description: string;
  createdById: string;
  categoryId: string;
}

export interface TicketCommentCreatedPayload {
  ticketId: string;
  commentId: string;
  authorId: string;
  body: string;
  isInternal: boolean;
}

export interface TicketUpdatedPayload {
  ticketId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedById: string;
}

export interface TicketAssignedPayload {
  ticketId: string;
  assignedToId: string | null;
  assignedGroupId: string | null;
}

export interface TicketResolvedOrClosedPayload {
  ticketId: string;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
}

export interface CmdbAssetLinkedPayload {
  ticketId: string;
  assetId: string;
  changedById: string;
}

export interface CsatSurveySubmittedPayload {
  ticketId: string;
  score: number;
  comment: string | null;
}
