import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CreateAutomationRuleDto {
  @IsUUID()
  categoryId!: string;

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
