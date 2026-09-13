import { IsOptional, IsString } from 'class-validator';

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  assignedUser?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
