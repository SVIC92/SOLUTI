import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import type { SupportGroup } from '../../core/models/group.model';
import type { RoleName, UserProfile } from '../../core/models/user.model';
import { UserService } from './user.service';

interface RoleTab {
  key: RoleName | 'ALL';
  label: string;
}

const ROLE_TABS: RoleTab[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'FINAL_USER', label: 'Usuarios Finales' },
  { key: 'TECHNICIAN', label: 'Técnicos' },
  { key: 'ADMIN', label: 'Administradores' },
];

const ROLE_LABELS: Record<RoleName, string> = {
  FINAL_USER: 'Usuario Final',
  TECHNICIAN: 'Técnico TI',
  ADMIN: 'Administrador',
};

type FormMode = 'closed' | 'create' | 'edit';

/** Gestión de Usuarios (solo ADMIN, ver roleGuard en app.routes.ts) — alta de cuentas,
 * reasignación de rol/grupo y activar/desactivar. Replica el diseño "SoluTI_AI"
 * (tabs + tabla densa, panel inline de alta/edición en vez de un modal: el sistema
 * de diseño no define ninguno, ver ticket-create.component para el mismo patrón de
 * formulario embebido). No expone borrado físico (el usuario tiene tickets,
 * comentarios, etc. asociados) ni cambio de contraseña de terceros — la contraseña
 * sigue siendo autoservicio desde Mi Perfil. */
@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './user-management.component.html',
})
export class UserManagementComponent {
  private readonly userService = inject(UserService);
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);

  readonly roleTabs = ROLE_TABS;
  readonly roleLabels = ROLE_LABELS;
  readonly activeTab = signal<RoleTab['key']>('ALL');
  readonly searchTerm = signal('');
  readonly users = signal<UserProfile[]>([]);
  readonly groups = signal<SupportGroup[]>([]);
  readonly loading = signal(true);

  readonly formMode = signal<FormMode>('closed');
  readonly editingUser = signal<UserProfile | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly togglingId = signal<string | null>(null);

  readonly filteredUsers = computed(() => {
    const tab = this.activeTab();
    const query = this.searchTerm().toLowerCase().trim();

    return this.users().filter((user) => {
      const matchesTab = tab === 'ALL' || user.role.name === tab;
      const matchesQuery =
        !query || user.fullName.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
      return matchesTab && matchesQuery;
    });
  });

  readonly countFor = computed(() => {
    const counts: Record<string, number> = { ALL: this.users().length };
    for (const user of this.users()) {
      counts[user.role.name] = (counts[user.role.name] ?? 0) + 1;
    }
    return counts;
  });

  form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: [''],
    role: this.fb.nonNullable.control<RoleName>('FINAL_USER'),
    groupId: [''],
  });

  constructor() {
    this.reload();
    this.userService.listGroups().subscribe((groups) => this.groups.set(groups));
  }

  private reload(): void {
    this.loading.set(true);
    this.userService.list().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  setTab(tab: RoleTab['key']): void {
    this.activeTab.set(tab);
  }

  onSearch(value: string): void {
    this.searchTerm.set(value);
  }

  openCreate(): void {
    this.editingUser.set(null);
    this.formError.set(null);
    this.form.reset({ fullName: '', email: '', password: '', role: 'FINAL_USER', groupId: '' });
    this.form.controls.email.enable();
    this.form.controls.password.setValidators([Validators.required, Validators.minLength(8)]);
    this.form.controls.password.updateValueAndValidity();
    this.formMode.set('create');
  }

  openEdit(user: UserProfile): void {
    this.editingUser.set(user);
    this.formError.set(null);
    this.form.reset({
      fullName: user.fullName,
      email: user.email,
      password: '',
      role: user.role.name,
      groupId: user.groupId ?? '',
    });
    this.form.controls.email.disable();
    this.form.controls.password.clearValidators();
    this.form.controls.password.updateValueAndValidity();
    this.formMode.set('edit');
  }

  closeForm(): void {
    this.formMode.set('closed');
    this.editingUser.set(null);
    this.form.controls.email.enable();
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

    const { fullName, email, password, role, groupId } = this.form.getRawValue();

    if (this.formMode() === 'create') {
      this.userService.create({ fullName, email, password, role, groupId: groupId || null }).subscribe({
        next: (user) => {
          this.users.update((list) => [user, ...list]);
          this.saving.set(false);
          this.closeForm();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(
            err?.status === 409 ? 'Ya existe un usuario con ese correo.' : 'No se pudo crear el usuario.',
          );
        },
      });
      return;
    }

    const editing = this.editingUser();
    if (!editing) return;

    this.userService.update(editing.id, { fullName, role, groupId: groupId || null }).subscribe({
      next: (user) => {
        this.users.update((list) => list.map((u) => (u.id === user.id ? user : u)));
        this.saving.set(false);
        this.closeForm();
      },
      error: () => {
        this.saving.set(false);
        this.formError.set('No se pudo guardar los cambios. Verifica que no estés editando tu propio rol/estado.');
      },
    });
  }

  toggleActive(user: UserProfile): void {
    if (this.isSelf(user)) return;
    this.togglingId.set(user.id);
    this.userService.update(user.id, { isActive: !user.isActive }).subscribe({
      next: (updated) => {
        this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
        this.togglingId.set(null);
      },
      error: () => this.togglingId.set(null),
    });
  }

  groupName(groupId: string | null): string {
    if (!groupId) return '—';
    return this.groups().find((g) => g.id === groupId)?.name ?? '—';
  }

  isSelf(user: UserProfile): boolean {
    return this.auth.currentUser?.sub === user.id;
  }
}
