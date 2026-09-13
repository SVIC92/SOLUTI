import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AnomalyCluster {
  id: string;
  clusterLabel: string;
  severity: 'warning' | 'critical';
  status: string;
  detectedAt: string;
  tickets: { id: string; code: string }[];
}

@Injectable({ providedIn: 'root' })
export class AnomalyService {
  private readonly http = inject(HttpClient);

  list(): Observable<AnomalyCluster[]> {
    return this.http.get<AnomalyCluster[]>(`${environment.apiUrl}/ai/anomaly-clusters`);
  }
}
