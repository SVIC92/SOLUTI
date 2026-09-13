import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { RoleName } from '../../../generated/prisma/enums.js';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  fullName!: string;

  @IsEnum(RoleName)
  role!: RoleName;

  @IsOptional()
  @IsUUID()
  groupId?: string;
}
