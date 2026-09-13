import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ChatbotMessageResponse {
  sessionId: string;
  reply: string;
  resolvedAutonomously: boolean;
  escalatedToHuman: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/ai/chatbot`;

  sendMessage(message: string, sessionId?: string): Observable<ChatbotMessageResponse> {
    return this.http.post<ChatbotMessageResponse>(`${this.baseUrl}/message`, { message, sessionId });
  }
}
