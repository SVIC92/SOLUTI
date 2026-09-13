import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CopilotSearchDto {
  @IsString()
  @MinLength(1)
  query!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
