import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { CreateTicketDto } from './create-ticket.dto.js';

/**
 * Igual que `CreateTicketDto`, pero usada por `services/ai-service` (ej. el
 * Chatbot Nivel 1 escalando una solicitud que no puede resolver de forma
 * autónoma). Como la llamada es servicio-a-servicio, no hay un JWT de usuario
 * del que extraer `createdById` — se pasa explícitamente en el cuerpo.
 */
export class CreateTicketViaServiceDto extends CreateTicketDto {
  @IsUUID()
  createdById!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  origin?: string; // ej. "chatbot" — para trazabilidad en logs
}
