import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';
import { RoleName } from '../../../generated/prisma/enums.js';

/** Edición de otro usuario por un ADMIN (PATCH /users/:id) — a diferencia de
 * UpdateProfileDto (autoservicio, solo fullName), aquí también se puede
 * reasignar rol/grupo y activar o desactivar la cuenta. */
export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsEnum(RoleName)
  role?: RoleName;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // null explícito = quitar al usuario de su grupo actual; string = reasignarlo;
  // undefined (campo ausente) = no tocar el grupo.
  @ValidateIf((_object, value) => value !== null)
  @IsOptional()
  @IsUUID()
  groupId?: string | null;
}
