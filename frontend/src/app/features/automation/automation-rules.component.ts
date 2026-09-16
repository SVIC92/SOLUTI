import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupportGroupService } from '../../core/services/support-group.service';
import type { SupportGroup } from '../../core/models/group.model';
import { AutomationRuleService } from './automation.service';
import type { AutomationRule } from './automation.service';

interface Category {
  id: string;
  name: string;
}

interface TechnicianOption {
  id: string;
  fullName: string;
}

/** Automatización y Reglas de Enrutamiento (plan `1.txt`, Fase 2): asigna
 * automáticamente cada ticket nuevo a un técnico o grupo según su categoría —
 * ver `TicketsService.create()` en el backend, que consulta la regla activa. */
@Component({
  selector: 'app-automation-rules',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './automation-rules.component.html',
})
export class AutomationRulesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly automationService = inject(AutomationRuleService);
  private readonly supportGroupService = inject(SupportGroupService);

  readonly rules = signal<AutomationRule[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly groups = signal<SupportGroup[]>([]);
  readonly technicians = signal<TechnicianOption[]>([]);
  readonly showForm = signal(false);
  readonly error = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    categoryId: ['', Validators.required],
    targetType: ['group' as 'group' | 'user', Validators.required],
    targetId: ['', Validators.required],
  });

  constructor() {
    this.reload();
    this.http
      .get<Category[]>(`${environment.apiUrl}/categories`)
      .pipe(catchError(() => of([])))
      .subscribe((c) => this.categories.set(c));
    this.supportGroupService
      .list()
      .pipe(catchError(() => of([])))
      .subscribe((g) => this.groups.set(g));
    this.http
      .get<TechnicianOption[]>(`${environment.apiUrl}/users`, { params: { role: 'TECHNICIAN' } })
      .pipe(catchError(() => of([])))
      .subscribe((users) => this.technicians.set(users));
  }

  private reload(): void {
    this.automationService
      .list()
      .pipe(catchError(() => of([])))
      .subscribe((rules) => this.rules.set(rules));
  }

  toggleForm(): void {
    this.showForm.update((v) => !v);
  }

  submit(): void {
    if (this.form.invalid) return;
    const { categoryId, targetType, targetId } = this.form.getRawValue();

    this.automationService
      .create({
        categoryId,
        assignToGroupId: targetType === 'group' ? targetId : undefined,
        assignToUserId: targetType === 'user' ? targetId : undefined,
      })
      .subscribe({
        next: () => {
          this.form.reset({ categoryId: '', targetType: 'group', targetId: '' });
          this.showForm.set(false);
          this.error.set(null);
          this.reload();
        },
        error: () => this.error.set('No se pudo crear la regla de automatización.'),
      });
  }

  toggleActive(rule: AutomationRule): void {
    this.automationService.toggleActive(rule.id, !rule.isActive).subscribe({
      next: () => this.reload(),
      error: () => this.error.set('No se pudo actualizar la regla.'),
    });
  }

  delete(rule: AutomationRule): void {
    this.automationService.remove(rule.id).subscribe({
      next: () => this.reload(),
      error: () => this.error.set('No se pudo eliminar la regla.'),
    });
  }
}
