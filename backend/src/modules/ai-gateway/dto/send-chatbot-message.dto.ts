import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class SendChatbotMessageDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @IsString()
  @MinLength(1)
  message!: string;
}
