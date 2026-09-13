import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { KnowledgeBaseService } from './kb.service';
import type { KnowledgeArticle } from './kb.service';

interface Category {
  id: string;
  name: string;
}

/** Vista/edición de un artículo de la Base de Conocimiento. Con `id === 'new'`
 * actúa como formulario de creación (solo TECHNICIAN/ADMIN). */
@Component({
  selector: 'app-kb-article',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './kb-article.component.html',
})
export class KbArticleComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly kbService = inject(KnowledgeBaseService);
  readonly auth = inject(AuthService);

  private readonly routeId = this.route.snapshot.paramMap.get('id')!;
  readonly isNew = this.routeId === 'new';

  readonly article = signal<KnowledgeArticle | null>(null);
  readonly editing = signal(this.isNew);
  readonly categories = signal<Category[]>([]);
  readonly error = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    content: ['', [Validators.required, Validators.minLength(10)]],
    categoryId: [''],
    isPublished: [false],
  });

  get canManage(): boolean {
    const role = this.auth.currentUser?.role;
    return role === 'ADMIN' || role === 'TECHNICIAN';
  }

  constructor() {
    this.http
      .get<Category[]>(`${environment.apiUrl}/categories`)
      .pipe(catchError(() => of([])))
      .subscribe((categories) => this.categories.set(categories));

    if (!this.isNew) {
      this.kbService
        .getById(this.routeId)
        .pipe(catchError(() => of(null)))
        .subscribe((article) => {
          if (!article) {
            this.error.set('No se pudo cargar el artículo.');
            return;
          }
          this.article.set(article);
          this.form.patchValue({
            title: article.title,
            content: article.content,
            categoryId: article.categoryId ?? '',
            isPublished: article.isPublished,
          });
        });
    }
  }

  toggleEdit(): void {
    this.editing.update((v) => !v);
  }

  submit(): void {
    if (this.form.invalid) return;
    const { title, content, categoryId, isPublished } = this.form.getRawValue();

    if (this.isNew) {
      this.kbService.create({ title, content, categoryId: categoryId || undefined }).subscribe({
        next: (created) => this.router.navigate(['/knowledge-base', created.id]),
        error: () => this.error.set('No se pudo crear el artículo.'),
      });
      return;
    }

    this.kbService
      .update(this.routeId, { title, content, categoryId: categoryId || undefined, isPublished })
      .subscribe({
        next: (updated) => {
          this.article.set(updated);
          this.editing.set(false);
        },
        error: () => this.error.set('No se pudo guardar el artículo.'),
      });
  }
}
