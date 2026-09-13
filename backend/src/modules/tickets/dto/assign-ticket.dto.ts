import { IsOptional, IsUUID } from 'class-validator';

export class AssignTicketDto {
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsUUID()
  assignedGroupId?: string;
}
