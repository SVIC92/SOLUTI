import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { CreateTicketRequest, Ticket, TicketDetail } from '../../core/models/ticket.model';

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/tickets`;

  list(filters: { status?: string; priority?: string } = {}): Observable<Ticket[]> {
    const params = filters as Record<string, string>;
    return this.http.get<Ticket[]>(this.baseUrl, { params });
  }

  getById(id: string): Observable<TicketDetail> {
    return this.http.get<TicketDetail>(`${this.baseUrl}/${id}`);
  }

  addComment(ticketId: string, body: string, isInternal: boolean): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${ticketId}/comments`, { body, isInternal });
  }

  create(request: CreateTicketRequest): Observable<Ticket> {
    return this.http.post<Ticket>(this.baseUrl, request);
  }

  updateStatus(id: string, status: string): Observable<Ticket> {
    return this.http.patch<Ticket>(`${this.baseUrl}/${id}`, { status });
  }

  assign(id: string, assignedToId: string): Observable<Ticket> {
    return this.http.post<Ticket>(`${this.baseUrl}/${id}/assign`, { assignedToId });
  }

  getSlaStatus(id: string): Observable<SlaStatus> {
    return this.http.get<SlaStatus>(`${this.baseUrl}/${id}/sla-status`);
  }

  linkAsset(id: string, assetId: string): Observable<Ticket> {
    return this.http.post<Ticket>(`${this.baseUrl}/${id}/link-asset`, { assetId });
  }
}

export interface SlaStatus {
  policy: { firstResponseMins: number; resolutionMins: number } | null;
  firstResponseDeadline: string | null;
  resolutionDeadline: string | null;
  firstResponseBreached: boolean;
  resolutionBreached: boolean;
  resolutionMinutesRemaining: number | null;
}
