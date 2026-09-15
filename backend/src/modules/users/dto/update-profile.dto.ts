import { IsOptional, IsString, MinLength } from 'class-validator';

/** Datos que un usuario puede editar de su propio perfil (GET/PATCH /users/me). */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;
}
