import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import type { AuthProvider, RoleName, UserProfile } from '../../core/models/user.model';
import { ProfileService } from './profile.service';

const ROLE_LABELS: Record<RoleName, string> = {
  FINAL_USER: 'Usuario Final',
  TECHNICIAN: 'Técnico TI',
  ADMIN: 'Administrador',
};

const AUTH_PROVIDER_LABELS: Record<AuthProvider, string> = {
  LOCAL: 'Correo y contraseña',
  LDAP: 'Directorio corporativo (LDAP)',
  AD: 'Active Directory',
  SERVICE: 'Cuenta de servicio',
  WHATSAPP: 'WhatsApp',
  SLACK: 'Slack',
  TEAMS: 'Microsoft Teams',
};

/** Mi Perfil — autoservicio: ver datos de la cuenta, editar nombre y (solo cuentas
 * LOCAL) cambiar contraseña. Replica el diseño "SoluTI_AI" (cards + tokens Tailwind). */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
})
export class ProfileComponent {
  private readonly profileService = inject(ProfileService);
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);

  readonly profile = signal<UserProfile | null>(null);
  readonly loading = signal(true);

  readonly savingProfile = signal(false);
  readonly profileMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  readonly changingPassword = signal(false);
  readonly passwordMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  readonly roleLabel = computed(() => {
    const role = this.profile()?.role.name;
    return role ? ROLE_LABELS[role] : '—';
  });

  readonly authProviderLabel = computed(() => {
    const provider = this.profile()?.authProvider;
    return provider ? AUTH_PROVIDER_LABELS[provider] : '—';
  });

  /** El cambio de contraseña autoservicio solo aplica a cuentas LOCAL; las de SSO
   * (LDAP/AD) o cuentas de sistema no tienen contraseña gestionada aquí. */
  readonly canChangePassword = computed(() => this.profile()?.authProvider === 'LOCAL');

  profileForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
  });

  passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  });

  constructor() {
    this.profileService.getMe().subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.profileForm.patchValue({ fullName: profile.fullName });
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  saveProfile(): void {
    if (this.profileForm.invalid) return;
    this.profileMessage.set(null);
    this.savingProfile.set(true);

    const { fullName } = this.profileForm.getRawValue();
    this.profileService.updateMe(fullName).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.savingProfile.set(false);
        this.profileMessage.set({ type: 'success', text: 'Perfil actualizado correctamente.' });
      },
      error: () => {
        this.savingProfile.set(false);
        this.profileMessage.set({ type: 'error', text: 'No se pudo actualizar el perfil. Intenta de nuevo.' });
      },
    });
  }

  changePassword(): void {
    if (this.passwordForm.invalid) return;
    this.passwordMessage.set(null);

    const { currentPassword, newPassword, confirmPassword } = this.passwordForm.getRawValue();
    if (newPassword !== confirmPassword) {
      this.passwordMessage.set({ type: 'error', text: 'La nueva contraseña y su confirmación no coinciden.' });
      return;
    }

    this.changingPassword.set(true);
    this.profileService.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.changingPassword.set(false);
        this.passwordForm.reset();
        this.passwordMessage.set({ type: 'success', text: 'Contraseña actualizada correctamente.' });
      },
      error: (err) => {
        this.changingPassword.set(false);
        const text =
          err?.status === 401
            ? 'La contraseña actual es incorrecta.'
            : 'No se pudo cambiar la contraseña. Intenta de nuevo.';
        this.passwordMessage.set({ type: 'error', text });
      },
    });
  }
}
