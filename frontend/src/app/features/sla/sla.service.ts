import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { TicketPriority } from '../../core/models/ticket.model';

export interface SlaPolicy {
  id: string;
  priority: TicketPriority;
  firstResponseMins: number;
  resolutionMins: number;
}

export interface UpsertSlaPolicyRequest {
  priority: TicketPriority;
  firstResponseMins: number;
  resolutionMins: number;
}

@Injectable({ providedIn: 'root' })
export class SlaPolicyService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/sla-policies`;

  list(): Observable<SlaPolicy[]> {
    return this.http.get<SlaPolicy[]>(this.baseUrl);
  }

  upsert(request: UpsertSlaPolicyRequest): Observable<SlaPolicy> {
    return this.http.post<SlaPolicy>(this.baseUrl, request);
  }
}
