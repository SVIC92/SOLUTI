import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class UpdateAutomationRuleDto {
  @IsOptional()
  @IsUUID()
  assignToGroupId?: string;

  @IsOptional()
  @IsUUID()
  assignToUserId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
