import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { SupportGroup } from '../../core/models/group.model';
import type { RoleName, UserProfile } from '../../core/models/user.model';

export interface CreateUserRequest {
  email: string;
  password: string;
  fullName: string;
  role: RoleName;
  groupId?: string | null;
}

export interface AdminUpdateUserRequest {
  fullName?: string;
  role?: RoleName;
  groupId?: string | null;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/users`;

  list(role?: RoleName | 'ALL'): Observable<UserProfile[]> {
    const params = (role && role !== 'ALL' ? { role } : {}) as Record<string, string>;
    return this.http.get<UserProfile[]>(this.baseUrl, { params });
  }

  create(request: CreateUserRequest): Observable<UserProfile> {
    return this.http.post<UserProfile>(this.baseUrl, request);
  }

  update(id: string, request: AdminUpdateUserRequest): Observable<UserProfile> {
    return this.http.patch<UserProfile>(`${this.baseUrl}/${id}`, request);
  }

  listGroups(): Observable<SupportGroup[]> {
    return this.http.get<SupportGroup[]>(`${environment.apiUrl}/support-groups`);
  }
}
