import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TokenService } from '../auth/token.service';

/** Adjunta el access token (Bearer) a toda petición hacia la API del backend. */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(TokenService).getAccessToken();

  if (!token) return next(req);

  return next(
    req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
  );
};
