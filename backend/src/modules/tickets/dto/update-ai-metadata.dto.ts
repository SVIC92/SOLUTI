import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { TicketPriority } from '../../../generated/prisma/enums.js';

/**
 * Payload que `services/ai-service` envía a `PATCH /internal/ai/tickets/:id/classification`
 * tras el triaje automático (plan `2.txt`, módulos 1 y 5 — clasificación fusionada
 * con sentimiento/urgencia). Todos los campos son opcionales: el core solo
 * actualiza lo que la IA efectivamente calculó.
 */
export class UpdateAiMetadataDto {
  @IsOptional()
  @IsString()
  aiSuggestedCategory?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  aiSuggestedPriority?: TicketPriority;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  @Max(1)
  aiSentimentScore?: number;

  @IsOptional()
  @IsString()
  aiSummary?: string;

  @IsOptional()
  @IsNumber()
  aiEtaMinutes?: number;

  // Enrutamiento inteligente (módulo 1): técnico sugerido por carga/habilidad.
  // Solo se aplica si el ticket todavía no tiene técnico asignado manualmente.
  @IsOptional()
  @IsUUID()
  autoAssignToId?: string;
}
