import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AutomationRule {
  id: string;
  categoryId: string;
  category: { id: string; name: string };
  assignToGroupId: string | null;
  assignToGroup: { id: string; name: string } | null;
  assignToUserId: string | null;
  isActive: boolean;
}

export interface CreateAutomationRuleRequest {
  categoryId: string;
  assignToGroupId?: string;
  assignToUserId?: string;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AutomationRuleService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/automation-rules`;

  list(): Observable<AutomationRule[]> {
    return this.http.get<AutomationRule[]>(this.baseUrl);
  }

  create(request: CreateAutomationRuleRequest): Observable<AutomationRule> {
    return this.http.post<AutomationRule>(this.baseUrl, request);
  }

  toggleActive(id: string, isActive: boolean): Observable<AutomationRule> {
    return this.http.patch<AutomationRule>(`${this.baseUrl}/${id}`, { isActive });
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }
}
