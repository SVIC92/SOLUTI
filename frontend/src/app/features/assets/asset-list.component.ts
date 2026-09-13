import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { AssetService } from './asset.service';
import type { Asset } from './asset.service';

/** Inventario de Activos de TI / CMDB (plan `1.txt`, Fase 2): registro de equipos
 * físicos/software que luego pueden vincularse a un ticket (ver ticket-detail). */
@Component({
  selector: 'app-asset-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './asset-list.component.html',
})
export class AssetListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly assetService = inject(AssetService);
  private readonly auth = inject(AuthService);

  readonly assets = signal<Asset[]>([]);
  readonly showForm = signal(false);
  readonly error = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    assetTag: ['', [Validators.required, Validators.minLength(2)]],
    type: ['laptop', Validators.required],
    assignedUser: [''],
  });

  /** Solo ADMIN/TECHNICIAN pueden registrar activos (ver `assets.controller.ts` en el backend). */
  get isStaff(): boolean {
    const role = this.auth.currentUser?.role;
    return role === 'ADMIN' || role === 'TECHNICIAN';
  }

  constructor() {
    this.reload();
  }

  private reload(): void {
    this.assetService
      .list()
      .pipe(catchError(() => of([])))
      .subscribe((assets) => this.assets.set(assets));
  }

  toggleForm(): void {
    this.showForm.update((v) => !v);
  }

  submit(): void {
    if (this.form.invalid) return;
    this.assetService.create(this.form.getRawValue()).subscribe({
      next: () => {
        this.form.reset({ assetTag: '', type: 'laptop', assignedUser: '' });
        this.showForm.set(false);
        this.error.set(null);
        this.reload();
      },
      error: () => this.error.set('No se pudo registrar el activo.'),
    });
  }

  statusClasses(status: string): string {
    switch (status.toLowerCase()) {
      case 'activo':
        return 'bg-status-resolved-bg text-status-resolved';
      case 'en reparación':
        return 'bg-status-warning-bg text-status-warning';
      default:
        return 'bg-surface-container text-on-surface-variant';
    }
  }
}
