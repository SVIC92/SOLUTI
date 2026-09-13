import { SetMetadata } from '@nestjs/common';
import { RoleName } from '../../generated/prisma/enums.js';

export const ROLES_KEY = 'roles';

/** Marca un handler/controller con los roles permitidos; leído por RolesGuard. */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
