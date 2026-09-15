import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { UserProfile } from '../../core/models/user.model';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/users/me`;

  getMe(): Observable<UserProfile> {
    return this.http.get<UserProfile>(this.baseUrl);
  }

  updateMe(fullName: string): Observable<UserProfile> {
    return this.http.patch<UserProfile>(this.baseUrl, { fullName });
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ success: true }> {
    return this.http.post<{ success: true }>(`${this.baseUrl}/change-password`, {
      currentPassword,
      newPassword,
    });
  }
}
