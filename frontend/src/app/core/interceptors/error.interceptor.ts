import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { TokenService } from '../auth/token.service';

/** Ante un 401 (token expirado/inválido), limpia sesión y redirige a login. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const tokens = inject(TokenService);

  return next(req).pipe(
    catchError((error) => {
      if (error.status === 401) {
        tokens.clear();
        router.navigateByUrl('/auth/login');
      }
      return throwError(() => error);
    }),
  );
};
