import { CommonModule } from '@angular/common';
import { Component, inject, signal, computed } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

type FocusableField = 'email' | 'password' | 'username' | 'ldapPassword';
type SubmitState = 'idle' | 'loading' | 'success';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  errorMessage: string | null = null;

  /** Solo se muestra el botón de SSO si el backend tiene AD/LDAP configurado
   * (`LDAP_URL`) — no todo despliegue on-premise tiene un directorio. */
  readonly ldapEnabled = signal(false);
  readonly ldapMode = signal(false);

  readonly submitState = signal<SubmitState>('idle');

  // Estado de la mascota: qué campo tiene foco (para que los ojos "sigan" el
  // texto) y cuánto se ha escrito (para desplazar la mirada horizontalmente).
  readonly focusedField = signal<FocusableField | null>(null);
  readonly typedLength = signal(0);
  readonly showPassword = signal(false);
  readonly showLdapPassword = signal(false);
  readonly eyeBlinkTrigger = signal(0);

  readonly eyesCovered = computed(
    () => this.focusedField() === 'password' || this.focusedField() === 'ldapPassword',
  );
  readonly eyesPeeking = computed(
    () => this.eyesCovered() && (this.showPassword() || this.showLdapPassword()),
  );
  readonly eyeShiftX = computed(() => {
    const field = this.focusedField();
    if (field !== 'email' && field !== 'username') return 0;
    const ratio = Math.min(this.typedLength() / 20, 1);
    return -4 + ratio * 8;
  });

  get eyeBlinkClass(): string {
    return this.eyeBlinkTrigger() % 2 === 0 ? 'eye-blink-a' : 'eye-blink-b';
  }

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  ldapForm = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  constructor() {
    this.auth
      .ldapStatus()
      .pipe(catchError(() => of({ enabled: false })))
      .subscribe(({ enabled }) => this.ldapEnabled.set(enabled));
  }

  toggleLdapMode(): void {
    this.errorMessage = null;
    this.ldapMode.update((v) => !v);
  }

  onFieldFocus(field: FocusableField): void {
    this.focusedField.set(field);
  }

  onFieldBlur(field: FocusableField): void {
    if (this.focusedField() === field) this.focusedField.set(null);
  }

  onTextInput(event: Event): void {
    this.typedLength.set((event.target as HTMLInputElement).value.length);
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
    this.eyeBlinkTrigger.update((v) => v + 1);
  }

  toggleLdapPasswordVisibility(): void {
    this.showLdapPassword.update((v) => !v);
    this.eyeBlinkTrigger.update((v) => v + 1);
  }

  submit(): void {
    if (this.form.invalid || this.submitState() !== 'idle') return;
    this.errorMessage = null;
    this.submitState.set('loading');

    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => {
        this.submitState.set('success');
        setTimeout(() => this.router.navigateByUrl('/dashboard'), 550);
      },
      error: () => {
        this.submitState.set('idle');
        this.errorMessage = 'Credenciales inválidas. Verifica tu email y contraseña.';
      },
    });
  }

  submitLdap(): void {
    if (this.ldapForm.invalid || this.submitState() !== 'idle') return;
    this.errorMessage = null;
    this.submitState.set('loading');

    const { username, password } = this.ldapForm.getRawValue();
    this.auth.loginWithLdap(username, password).subscribe({
      next: () => {
        this.submitState.set('success');
        setTimeout(() => this.router.navigateByUrl('/dashboard'), 550);
      },
      error: () => {
        this.submitState.set('idle');
        this.errorMessage = 'No se pudo iniciar sesión con tu cuenta corporativa. Verifica tu usuario y contraseña.';
      },
    });
  }
}
