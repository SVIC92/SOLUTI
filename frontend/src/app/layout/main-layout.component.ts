import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import type { RoleName } from '../core/models/user.model';
import { ThemeToggleComponent } from '../core/theme/theme-toggle.component';

interface NavItem {
  label: string;
  icon: string;
  path?: string; // si falta, el módulo aún no está implementado (Fase 2/IA) — se muestra deshabilitado
  badge?: string;
  aiIcon?: boolean;
  // Si falta, visible para cualquier rol autenticado. Debe reflejar los mismos
  // roles que el `roleGuard(...)` de la ruta correspondiente en app.routes.ts —
  // esto es solo UX (ocultar lo que no se puede usar), el guard real es el del router.
  roles?: RoleName[];
}

/**
 * Shell compartido (sidebar + topbar) que replica el sistema de diseño "SoluTI_AI"
 * exportado desde Stitch. Los módulos aún no implementados (Copilot, KB, CMDB, SLA,
 * Chatbot, Reportes) se muestran en el menú pero sin navegación real todavía.
 * "Mi Perfil" se accede desde el avatar de la topbar (ver profile.component.ts).
 */
@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ThemeToggleComponent],
  templateUrl: './main-layout.component.html',
})
export class MainLayoutComponent {
  private static readonly SIDEBAR_COLLAPSED_KEY = 'soluti_sidebar_collapsed';

  readonly auth = inject(AuthService);

  // Preferencia puramente visual por navegador; no hay necesidad de sincronizarla con el backend.
  readonly sidebarCollapsed = signal(this.readCollapsedPreference());

  private readonly operations: NavItem[] = [
    { label: 'Panel Principal', icon: 'dashboard', path: '/dashboard' },
    { label: 'Gestión de Tickets', icon: 'confirmation_number', path: '/tickets' },
    { label: 'Copilot & Triaje IA', icon: 'auto_awesome', badge: 'Beta', aiIcon: true },
    { label: 'Chatbot IA / Agente N1', icon: 'smart_toy', path: '/chatbot', aiIcon: true },
    // Roles alineados con el `roleGuard(['ADMIN', 'TECHNICIAN'])` de /anomalies en app.routes.ts.
    { label: 'Detección de Anomalías', icon: 'hub', path: '/anomalies', aiIcon: true, roles: ['ADMIN', 'TECHNICIAN'] },
  ];

  private readonly management: NavItem[] = [
    { label: 'Base Conocimiento', icon: 'menu_book', path: '/knowledge-base' },
    { label: 'Inventario Activos (CMDB)', icon: 'devices', path: '/assets' },
    // Roles alineados con /sla (ADMIN) y /surveys (ADMIN, TECHNICIAN) en app.routes.ts.
    { label: 'Acuerdos SLA & Métricas', icon: 'timer', path: '/sla', roles: ['ADMIN'] },
    { label: 'Encuestas CSAT', icon: 'sentiment_satisfied', path: '/surveys', roles: ['ADMIN', 'TECHNICIAN'] },
  ];

  private readonly system: NavItem[] = [
    // Roles alineados con /users, /groups y /automation (todos ADMIN) en app.routes.ts.
    { label: 'Gestión de Usuarios', icon: 'group', path: '/users', roles: ['ADMIN'] },
    { label: 'Grupos de Soporte', icon: 'workspaces', path: '/groups', roles: ['ADMIN'] },
    { label: 'Configuración', icon: 'settings', path: '/automation', roles: ['ADMIN'] },
  ];

  private visibleTo(items: NavItem[]) {
    const role = this.auth.currentUser?.role;
    return items.filter((item) => !item.roles || (!!role && item.roles.includes(role)));
  }

  // Getters simples (no `computed()`): `auth.currentUser` no es un signal, y de
  // todas formas el layout se recrea en cada login/logout (cambia toda la sesión).
  get visibleOperations(): NavItem[] {
    return this.visibleTo(this.operations);
  }

  get visibleManagement(): NavItem[] {
    return this.visibleTo(this.management);
  }

  get visibleSystem(): NavItem[] {
    return this.visibleTo(this.system);
  }

  logout(): void {
    this.auth.logout();
  }

  toggleSidebar(): void {
    const next = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(next);
    try {
      localStorage.setItem(MainLayoutComponent.SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // localStorage puede no estar disponible (modo privado); la preferencia solo no persiste.
    }
  }

  private readCollapsedPreference(): boolean {
    try {
      return localStorage.getItem(MainLayoutComponent.SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  }
}
