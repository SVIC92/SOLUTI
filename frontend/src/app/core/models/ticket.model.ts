export type TicketStatus = 'NEW' | 'IN_PROGRESS' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface TicketCategory {
  id: string;
  name: string;
}

export interface Ticket {
  id: string;
  code: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  categoryId: string;
  category?: TicketCategory;
  createdById: string;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketRequest {
  title: string;
  description: string;
  categoryId: string;
  priority?: TicketPriority;
}

export interface TicketComment {
  id: string;
  body: string;
  isInternal: boolean;
  authorId: string;
  author?: TicketPerson;
  createdAt: string;
}

export interface TicketHistoryEntry {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface TicketPerson {
  id: string;
  fullName: string;
  email: string;
}

/** Forma devuelta por GET /tickets/:id (incluye relaciones). */
export interface TicketDetail extends Ticket {
  createdBy?: TicketPerson;
  assignedTo?: TicketPerson | null;
  comments?: TicketComment[];
  history?: TicketHistoryEntry[];
  assetId?: string | null;
  asset?: { id: string; assetTag: string; type: string } | null;

  // Metadatos de IA (plan `2.txt`) — rellenados de forma asíncrona por ai-service
  // vía PATCH /internal/ai/tickets/:id/classification. Todos opcionales: el core
  // nunca los calcula, solo los expone tal cual los recibe.
  aiSuggestedCategory?: string | null;
  aiSuggestedPriority?: TicketPriority | null;
  aiSentimentScore?: number | null;
  aiSummary?: string | null;
  aiEtaMinutes?: number | null;
}
