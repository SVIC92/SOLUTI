import { IsEnum, IsOptional } from 'class-validator';
import { TicketPriority, TicketStatus } from '../../../generated/prisma/enums.js';

export class UpdateTicketDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
