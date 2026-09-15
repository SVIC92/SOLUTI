import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { TicketPriority } from '../../../core/models/ticket.model';
import { TicketService } from '../ticket.service';

interface Category {
  id: string;
  name: string;
}

/** Nueva Solicitud / Portal — replica el diseño "SoluTI_AI". El panel de
 * "Detección Automática por IA" y las guías de autoservicio son representativos
 * del sistema de diseño; se conectan cuando el módulo de Triaje IA esté activo. */
@Component({
  selector: 'app-ticket-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './ticket-create.component.html',
})
export class TicketCreateComponent {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly ticketService = inject(TicketService);
  private readonly router = inject(Router);

  readonly categories = signal<Category[]>([]);
  readonly error = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: ['', [Validators.required, Validators.minLength(10)]],
    categoryId: ['', Validators.required],
    priority: this.fb.nonNullable.control<TicketPriority>('MEDIUM'),
  });

  constructor() {
    this.http
      .get<Category[]>(`${environment.apiUrl}/categories`)
      .pipe(catchError(() => of([])))
      .subscribe((categories) => this.categories.set(categories));
  }

  submit(): void {
    if (this.form.invalid) return;

    this.ticketService.create(this.form.getRawValue()).subscribe({
      next: (ticket) => this.router.navigate(['/tickets', ticket.id]),
      error: () => this.error.set('No se pudo crear el ticket. Inténtalo nuevamente.'),
    });
  }
}
