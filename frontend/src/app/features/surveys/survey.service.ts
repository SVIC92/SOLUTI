import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Survey {
  id: string;
  ticketId: string;
  ticket?: { code: string; title: string };
  score: number | null;
  comment: string | null;
  sentAt: string;
  respondedAt: string | null;
}

export interface SurveyStats {
  totalSent: number;
  totalResponded: number;
  responseRate: number;
  averageScore: number | null;
  distribution: Record<number, number>;
}

@Injectable({ providedIn: 'root' })
export class SurveyService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/surveys`;

  list(): Observable<Survey[]> {
    return this.http.get<Survey[]>(this.baseUrl);
  }

  getStats(): Observable<SurveyStats> {
    return this.http.get<SurveyStats>(`${this.baseUrl}/stats`);
  }

  getForTicket(ticketId: string): Observable<Survey> {
    return this.http.get<Survey>(`${this.baseUrl}/ticket/${ticketId}`);
  }

  respond(ticketId: string, score: number, comment?: string): Observable<Survey> {
    return this.http.post<Survey>(`${this.baseUrl}/ticket/${ticketId}/respond`, { score, comment });
  }
}
