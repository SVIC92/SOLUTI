import { IsString, IsUUID, MinLength } from 'class-validator';

export class CopilotDraftDto {
  @IsUUID()
  ticketId!: string;

  @IsString()
  @MinLength(1)
  technicianNotes!: string;
}
