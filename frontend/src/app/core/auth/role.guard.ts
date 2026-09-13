import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import type { RoleName } from '../models/user.model';
import { AuthService } from './auth.service';

/**
 * Guard factory con RBAC: uso en rutas vía `data: { roles: [...] }` o directamente
 * `canActivate: [roleGuard(['ADMIN'])]`. Redirige a /dashboard si el rol no matchea
 * (la ruta existe pero el usuario no tiene permiso, a diferencia de authGuard).
 */
export function roleGuard(allowedRoles: RoleName[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    const user = auth.currentUser;
    if (user && allowedRoles.includes(user.role)) return true;

    router.navigateByUrl('/dashboard');
    return false;
  };
}
