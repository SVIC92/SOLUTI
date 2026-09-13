import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAssetDto {
  @IsString()
  @MinLength(2)
  assetTag!: string; // ej. DELL-042

  @IsString()
  type!: string; // laptop, servidor, impresora, software...

  @IsOptional()
  @IsString()
  assignedUser?: string;

  @IsOptional()
  @IsString()
  status?: string; // activo, en reparación, dado de baja
}
