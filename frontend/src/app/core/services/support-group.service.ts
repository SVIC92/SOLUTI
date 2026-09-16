import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { SupportGroup } from '../models/group.model';

/** Cliente único de GET/POST/PATCH/DELETE `/support-groups` — usado tanto por la
 * gestión de grupos (CRUD completo) como por los selectores de solo lectura en
 * gestión de usuarios y reglas de automatización. */
@Injectable({ providedIn: 'root' })
export class SupportGroupService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/support-groups`;

  list(): Observable<SupportGroup[]> {
    return this.http.get<SupportGroup[]>(this.baseUrl);
  }

  create(name: string): Observable<SupportGroup> {
    return this.http.post<SupportGroup>(this.baseUrl, { name });
  }

  update(id: string, name: string): Observable<SupportGroup> {
    return this.http.patch<SupportGroup>(`${this.baseUrl}/${id}`, { name });
  }

  remove(id: string): Observable<{ success: true }> {
    return this.http.delete<{ success: true }>(`${this.baseUrl}/${id}`);
  }
}
