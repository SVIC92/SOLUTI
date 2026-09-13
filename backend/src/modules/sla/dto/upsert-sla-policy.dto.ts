import { IsEnum, IsInt, Min } from 'class-validator';
import { TicketPriority } from '../../../generated/prisma/enums.js';

export class UpsertSlaPolicyDto {
  @IsEnum(TicketPriority)
  priority!: TicketPriority;

  @IsInt()
  @Min(1)
  firstResponseMins!: number;

  @IsInt()
  @Min(1)
  resolutionMins!: number;
}
