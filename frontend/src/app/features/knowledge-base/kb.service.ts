import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  categoryId: string | null;
  category?: { id: string; name: string } | null;
  isPublished: boolean;
  articleDraftGeneratedByAi: boolean;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateArticleRequest {
  title: string;
  content: string;
  categoryId?: string;
}

export interface UpdateArticleRequest {
  title?: string;
  content?: string;
  categoryId?: string;
  isPublished?: boolean;
}

@Injectable({ providedIn: 'root' })
export class KnowledgeBaseService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/knowledge-base`;

  list(search?: string): Observable<KnowledgeArticle[]> {
    const params = search ? { search } : undefined;
    return this.http.get<KnowledgeArticle[]>(this.baseUrl, { params });
  }

  getById(id: string): Observable<KnowledgeArticle> {
    return this.http.get<KnowledgeArticle>(`${this.baseUrl}/${id}`);
  }

  create(request: CreateArticleRequest): Observable<KnowledgeArticle> {
    return this.http.post<KnowledgeArticle>(this.baseUrl, request);
  }

  update(id: string, request: UpdateArticleRequest): Observable<KnowledgeArticle> {
    return this.http.patch<KnowledgeArticle>(`${this.baseUrl}/${id}`, request);
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }
}
