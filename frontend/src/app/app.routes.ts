import type { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

export const routes: Routes = [
  {
    path: 'auth/login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () => import('./layout/main-layout.component').then((m) => m.MainLayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'tickets',
        loadComponent: () =>
          import('./features/tickets/ticket-list/ticket-list.component').then(
            (m) => m.TicketListComponent,
          ),
      },
      {
        path: 'tickets/new',
        loadComponent: () =>
          import('./features/tickets/ticket-create/ticket-create.component').then(
            (m) => m.TicketCreateComponent,
          ),
      },
      {
        path: 'tickets/:id',
        loadComponent: () =>
          import('./features/tickets/ticket-detail/ticket-detail.component').then(
            (m) => m.TicketDetailComponent,
          ),
      },
      {
        path: 'knowledge-base',
        loadComponent: () => import('./features/knowledge-base/kb-list.component').then((m) => m.KbListComponent),
      },
      {
        path: 'knowledge-base/new',
        canActivate: [roleGuard(['ADMIN', 'TECHNICIAN'])],
        loadComponent: () => import('./features/knowledge-base/kb-article.component').then((m) => m.KbArticleComponent),
      },
      {
        path: 'knowledge-base/:id',
        loadComponent: () => import('./features/knowledge-base/kb-article.component').then((m) => m.KbArticleComponent),
      },
      {
        path: 'anomalies',
        canActivate: [roleGuard(['ADMIN', 'TECHNICIAN'])],
        loadComponent: () =>
          import('./features/anomalies/anomaly-dashboard.component').then((m) => m.AnomalyDashboardComponent),
      },
      {
        path: 'chatbot',
        loadComponent: () => import('./features/chatbot/chatbot.component').then((m) => m.ChatbotComponent),
      },
      {
        path: 'surveys',
        canActivate: [roleGuard(['ADMIN', 'TECHNICIAN'])],
        loadComponent: () =>
          import('./features/surveys/survey-dashboard.component').then((m) => m.SurveyDashboardComponent),
      },
      {
        path: 'sla',
        canActivate: [roleGuard(['ADMIN'])],
        loadComponent: () => import('./features/sla/sla-admin.component').then((m) => m.SlaAdminComponent),
      },
      {
        path: 'automation',
        canActivate: [roleGuard(['ADMIN'])],
        loadComponent: () =>
          import('./features/automation/automation-rules.component').then((m) => m.AutomationRulesComponent),
      },
      {
        path: 'assets',
        loadComponent: () =>
          import('./features/assets/asset-list.component').then((m) => m.AssetListComponent),
      },
      // Solo ADMIN puede gestionar usuarios — ejemplo de uso de roleGuard (plan, sección 4).
      {
        path: 'users',
        canActivate: [roleGuard(['ADMIN'])],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent), // placeholder hasta implementar users feature
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
