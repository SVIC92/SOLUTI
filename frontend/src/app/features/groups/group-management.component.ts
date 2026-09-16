import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { SupportGroup } from '../../core/models/group.model';
import { SupportGroupService } from '../../core/services/support-group.service';

type FormMode = 'closed' | 'create' | 'edit';

/** Gestión de Grupos de Soporte (solo ADMIN, ver roleGuard en app.routes.ts): alta,
 * renombrado y borrado de los equipos (Redes, Hardware, Software, ...) a los que se
 * asignan usuarios (ver Gestión de Usuarios) y tickets/reglas de automatización.
 * Mismo patrón de panel inline que user-management.component (no hay modal en el
 * sistema de diseño). No se permite borrar un grupo con usuarios asignados — el
 * backend responde 409 y ese mensaje se muestra tal cual. */
@Component({
  selector: 'app-group-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './group-management.component.html',
})
export class GroupManagementComponent {
  private readonly groupService = inject(SupportGroupService);
  private readonly fb = inject(FormBuilder);

  readonly groups = signal<SupportGroup[]>([]);
  readonly loading = signal(true);
  readonly searchTerm = signal('');

  readonly formMode = signal<FormMode>('closed');
  readonly editingGroup = signal<SupportGroup | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly deletingId = signal<string | null>(null);
  readonly deleteError = signal<string | null>(null);

  readonly filteredGroups = computed(() => {
    const query = this.searchTerm().toLowerCase().trim();
    if (!query) return this.groups();
    return this.groups().filter((g) => g.name.toLowerCase().includes(query));
  });

  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
  });

  constructor() {
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.groupService.list().subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSearch(value: string): void {
    this.searchTerm.set(value);
  }

  openCreate(): void {
    this.editingGroup.set(null);
    this.formError.set(null);
    this.form.reset({ name: '' });
    this.formMode.set('create');
  }

  openEdit(group: SupportGroup): void {
    this.editingGroup.set(group);
    this.formError.set(null);
    this.form.reset({ name: group.name });
    this.formMode.set('edit');
  }

  closeForm(): void {
    this.formMode.set('closed');
    this.editingGroup.set(null);
  }

  toggleForm(): void {
    if (this.formMode() === 'closed') {
      this.openCreate();
    } else {
      this.closeForm();
    }
  }

  submit(): void {
    if (this.form.invalid) return;
    this.formError.set(null);
    this.saving.set(true);

    const { name } = this.form.getRawValue();

    if (this.formMode() === 'create') {
      this.groupService.create(name).subscribe({
        next: () => {
          this.saving.set(false);
          this.closeForm();
          this.reload();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(
            err?.status === 409 ? `Ya existe un grupo llamado "${name}".` : 'No se pudo crear el grupo.',
          );
        },
      });
      return;
    }

    const editing = this.editingGroup();
    if (!editing) return;

    this.groupService.update(editing.id, name).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeForm();
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(
          err?.status === 409 ? `Ya existe un grupo llamado "${name}".` : 'No se pudo guardar los cambios.',
        );
      },
    });
  }

  remove(group: SupportGroup): void {
    this.deleteError.set(null);
    this.deletingId.set(group.id);
    this.groupService.remove(group.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.reload();
      },
      error: (err) => {
        this.deletingId.set(null);
        this.deleteError.set(err?.error?.message ?? `No se pudo eliminar "${group.name}".`);
      },
    });
  }

  memberCount(group: SupportGroup): number {
    return group.members?.length ?? 0;
  }
}
