import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SimilarTicketResult {
  id: string;
  code: string;
  title: string;
  distance: number;
}

/** Copilot para Técnicos (plan `2.txt`, módulo 3): búsqueda semántica sobre
 * tickets ya resueltos + generación de borradores de respuesta. Llama a los
 * endpoints ya expuestos por el backend (`AiGatewayController`), que a su vez
 * proxean a `services/ai-service`. */
@Injectable({ providedIn: 'root' })
export class CopilotService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/ai/copilot`;

  searchSimilar(query: string, categoryId?: string): Observable<{ results: SimilarTicketResult[] }> {
    return this.http.post<{ results: SimilarTicketResult[] }>(`${this.baseUrl}/search`, { query, categoryId });
  }

  draft(ticketId: string, technicianNotes: string): Observable<{ draft: string }> {
    return this.http.post<{ draft: string }>(`${this.baseUrl}/draft`, { ticketId, technicianNotes });
  }
}
