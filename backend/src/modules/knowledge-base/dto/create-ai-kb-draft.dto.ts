import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/** Payload que `services/ai-service` envía tras generar un borrador de artículo
 * a partir de un ticket resuelto (plan `2.txt`, módulo 6). */
export class CreateAiKbDraftDto {
  @IsUUID()
  sourceTicketId!: string;

  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(10)
  content!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
