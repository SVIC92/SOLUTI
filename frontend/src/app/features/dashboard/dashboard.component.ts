import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

interface DashboardMetrics {
  openTickets: number;
  avgFirstResponseMinutes: number | null;
  closedByTechnician: { technicianId: string | null; closedCount: number }[];
}

/**
 * Panel Principal — replica el diseño "NovaDesk AI" exportado de Stitch.
 * Las tarjetas de "Tickets Abiertos" y "SLA Respuesta" usan datos reales del
 * endpoint /reports/dashboard (ver ReportsService en el backend). El resto de
 * widgets (clúster de incidentes IA, carga por técnico, KB sugerida, CMDB) son
 * representativos del diseño final — se conectan cuando se implementen los
 * módulos de IA y Fase 2 correspondientes (ver plan).
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  private readonly http = inject(HttpClient);

  metrics: DashboardMetrics | null = null;

  constructor() {
    this.http
      .get<DashboardMetrics>(`${environment.apiUrl}/reports/dashboard`)
      .subscribe((data) => (this.metrics = data));
  }
}
