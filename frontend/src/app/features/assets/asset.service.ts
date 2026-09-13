import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Asset {
  id: string;
  assetTag: string;
  type: string;
  assignedUser: string | null;
  status: string;
}

export interface CreateAssetRequest {
  assetTag: string;
  type: string;
  assignedUser?: string;
  status?: string;
}

@Injectable({ providedIn: 'root' })
export class AssetService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/assets`;

  list(): Observable<Asset[]> {
    return this.http.get<Asset[]>(this.baseUrl);
  }

  create(request: CreateAssetRequest): Observable<Asset> {
    return this.http.post<Asset>(this.baseUrl, request);
  }
}
