import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
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

  submit(): void {
    if (this.form.invalid) return;
    this.errorMessage = null;

    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => this.router.navigateByUrl('/dashboard'),
      error: () => (this.errorMessage = 'Credenciales inválidas. Verifica tu email y contraseña.'),
    });
  }

  submitLdap(): void {
    if (this.ldapForm.invalid) return;
    this.errorMessage = null;

    const { username, password } = this.ldapForm.getRawValue();
    this.auth.loginWithLdap(username, password).subscribe({
      next: () => this.router.navigateByUrl('/dashboard'),
      error: () => (this.errorMessage = 'No se pudo iniciar sesión con tu cuenta corporativa. Verifica tu usuario y contraseña.'),
    });
  }
}
