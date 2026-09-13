import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface ChatbotMessageRequest {
  sessionId?: string;
  userId: string;
  ticketId?: string;
  channel?: 'web' | 'whatsapp' | 'slack' | 'teams';
  message: string;
}

export interface ChatbotMessageResponse {
  sessionId: string;
  reply: string;
  resolvedAutonomously: boolean;
  escalatedToHuman: boolean;
}

/**
 * Cliente HTTP interno hacia services/ai-service — vía síncrona usada por el chatbot
 * (request/response) y el copilot (búsqueda semántica/borrador bajo demanda desde la UI).
 * El flujo asíncrono (triaje, embeddings, anomalías, KB drafts) va por Redis Streams,
 * ver ai-gateway/event-publisher.ts.
 */
@Injectable()
export class AiClient {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get baseUrl(): string {
    return this.config.get<string>('AI_SERVICE_URL', 'http://ai-service:8000');
  }

  private get headers() {
    return { 'X-Api-Key': this.config.getOrThrow<string>('AI_SERVICE_API_KEY') };
  }

  async sendChatbotMessage(request: ChatbotMessageRequest): Promise<ChatbotMessageResponse> {
    try {
      const response = await firstValueFrom(
        this.http.post(`${this.baseUrl}/api/ai/chatbot/message`, request, { headers: this.headers }),
      );
      return response.data;
    } catch {
      // Modo degradado: si el ai-service no responde, el chatbot escala a humano
      // en vez de fallar la petición del usuario final (ver plan, riesgos/mitigaciones).
      throw new ServiceUnavailableException(
        'El asistente virtual no está disponible en este momento; tu mensaje fue derivado a un técnico.',
      );
    }
  }

  async searchSimilarTickets(query: string, categoryId?: string) {
    const response = await firstValueFrom(
      this.http.post(
        `${this.baseUrl}/api/ai/copilot/search`,
        { query, categoryId },
        { headers: this.headers },
      ),
    );
    return response.data;
  }

  async draftResponse(ticketId: string, technicianNotes: string) {
    const response = await firstValueFrom(
      this.http.post(
        `${this.baseUrl}/api/ai/copilot/draft`,
        { ticketId, technicianNotes },
        { headers: this.headers },
      ),
    );
    return response.data;
  }
}
