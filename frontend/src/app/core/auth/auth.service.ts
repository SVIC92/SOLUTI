import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenService } from './token.service';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenService);
  private readonly router = inject(Router);

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap(({ accessToken, refreshToken }) => this.tokens.setTokens(accessToken, refreshToken)));
  }

  /** SSO por AD/LDAP (plan `1.txt`, Portal Multi-canal/Integraciones). */
  loginWithLdap(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login/ldap`, { username, password })
      .pipe(tap(({ accessToken, refreshToken }) => this.tokens.setTokens(accessToken, refreshToken)));
  }

  /** Si el backend no tiene LDAP_URL configurado, el botón de SSO no debe mostrarse. */
  ldapStatus(): Observable<{ enabled: boolean }> {
    return this.http.get<{ enabled: boolean }>(`${environment.apiUrl}/auth/login/ldap/status`);
  }

  logout(): void {
    this.tokens.clear();
    this.router.navigateByUrl('/auth/login');
  }

  isAuthenticated(): boolean {
    return this.tokens.getCurrentUser() !== null;
  }

  get currentUser() {
    return this.tokens.getCurrentUser();
  }
}
