import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import type { TicketPriority } from '../../core/models/ticket.model';
import { SlaPolicyService } from './sla.service';

const PRIORITIES: TicketPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const DEFAULTS: Record<TicketPriority, { firstResponseMins: number; resolutionMins: number }> = {
  CRITICAL: { firstResponseMins: 15, resolutionMins: 240 },
  HIGH: { firstResponseMins: 30, resolutionMins: 480 },
  MEDIUM: { firstResponseMins: 120, resolutionMins: 1440 },
  LOW: { firstResponseMins: 240, resolutionMins: 2880 },
};

/** Acuerdos SLA & Métricas (plan `1.txt`, Fase 2): define, por prioridad, el tiempo
 * límite de primera respuesta y de resolución. TicketsService asigna automáticamente
 * la política vigente al crear/re-priorizar un ticket (ver backend modules/sla). */
@Component({
  selector: 'app-sla-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './sla-admin.component.html',
})
export class SlaAdminComponent {
  private readonly fb = inject(FormBuilder);
  private readonly slaService = inject(SlaPolicyService);

  readonly priorities = PRIORITIES;
  readonly savedMessage = signal<TicketPriority | null>(null);
  readonly error = signal<string | null>(null);

  readonly forms: Record<TicketPriority, FormGroup> = {
    CRITICAL: this.buildForm('CRITICAL'),
    HIGH: this.buildForm('HIGH'),
    MEDIUM: this.buildForm('MEDIUM'),
    LOW: this.buildForm('LOW'),
  };

  constructor() {
    this.slaService
      .list()
      .pipe(catchError(() => of([])))
      .subscribe((policies) => {
        for (const policy of policies) {
          this.forms[policy.priority].patchValue({
            firstResponseMins: policy.firstResponseMins,
            resolutionMins: policy.resolutionMins,
          });
        }
      });
  }

  private buildForm(priority: TicketPriority): FormGroup {
    return this.fb.nonNullable.group({
      firstResponseMins: [DEFAULTS[priority].firstResponseMins],
      resolutionMins: [DEFAULTS[priority].resolutionMins],
    });
  }

  save(priority: TicketPriority): void {
    const { firstResponseMins, resolutionMins } = this.forms[priority].getRawValue();
    this.slaService.upsert({ priority, firstResponseMins, resolutionMins }).subscribe({
      next: () => {
        this.error.set(null);
        this.savedMessage.set(priority);
        setTimeout(() => this.savedMessage.set(null), 2500);
      },
      error: () => this.error.set('No se pudo guardar la política de SLA.'),
    });
  }

  priorityLabel(priority: TicketPriority): string {
    const labels: Record<TicketPriority, string> = {
      CRITICAL: 'Crítica (P1)',
      HIGH: 'Alta (P2)',
      MEDIUM: 'Media (P3)',
      LOW: 'Baja (P4)',
    };
    return labels[priority];
  }

  priorityClasses(priority: TicketPriority): string {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-status-incident-bg text-status-incident';
      case 'HIGH':
        return 'bg-status-warning-bg text-status-warning';
      default:
        return 'bg-surface-container text-on-surface';
    }
  }
}
