import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { KnowledgeBaseService } from './kb.service';
import type { KnowledgeArticle } from './kb.service';

/** Base de Conocimiento / FAQ — Self-Service (plan `1.txt`, Fase 2): permite a
 * cualquier usuario buscar soluciones antes de abrir un ticket. Técnicos/Admin
 * ven también los borradores (no publicados) para poder completarlos. */
@Component({
  selector: 'app-kb-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './kb-list.component.html',
})
export class KbListComponent {
  private readonly kbService = inject(KnowledgeBaseService);
  readonly auth = inject(AuthService);

  readonly articles = signal<KnowledgeArticle[]>([]);
  readonly searchTerm = signal('');

  get canManage(): boolean {
    const role = this.auth.currentUser?.role;
    return role === 'ADMIN' || role === 'TECHNICIAN';
  }

  constructor() {
    this.reload();
  }

  private reload(): void {
    this.kbService.list(this.searchTerm() || undefined).subscribe((articles) => this.articles.set(articles));
  }

  onSearch(value: string): void {
    this.searchTerm.set(value);
    this.reload();
  }
}
