import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SupportGroup {
  id: string;
  name: string;
  members: { id: string; fullName: string }[];
}

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
}
