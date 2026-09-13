import { IsString, MinLength } from 'class-validator';

export class CreateSupportGroupDto {
  @IsString()
  @MinLength(2)
  name!: string; // ej. Redes, Hardware, Software, Cuentas
}
