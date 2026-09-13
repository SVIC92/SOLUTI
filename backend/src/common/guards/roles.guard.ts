import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '../../generated/prisma/enums.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

/**
 * RBAC: compara los roles declarados con @Roles(...) en el handler/controller
 * contra el rol del usuario autenticado (payload del JWT, ver JwtStrategy).
 * Debe usarse siempre después de JwtAuthGuard (@UseGuards(JwtAuthGuard, RolesGuard)).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // sin @Roles(...) => cualquier usuario autenticado puede acceder
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    return !!user && requiredRoles.includes(user.role as RoleName);
  }
}
