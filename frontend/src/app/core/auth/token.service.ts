import { Injectable } from '@angular/core';
import type { CurrentUser } from '../models/user.model';

const ACCESS_TOKEN_KEY = 'helpdesk.accessToken';
const REFRESH_TOKEN_KEY = 'helpdesk.refreshToken';

/**
 * Guarda los tokens JWT y decodifica el payload del access token para exponer
 * el usuario actual (rol, id, grupo) sin llamadas extra al backend.
 */
@Injectable({ providedIn: 'root' })
export class TokenService {
  setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  clear(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  getCurrentUser(): CurrentUser | null {
    const token = this.getAccessToken();
    if (!token) return null;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const isExpired = payload.exp * 1000 < Date.now();
      return isExpired ? null : (payload as CurrentUser);
    } catch {
      return null;
    }
  }
}
