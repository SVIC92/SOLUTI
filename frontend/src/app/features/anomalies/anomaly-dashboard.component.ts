import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnomalyService } from './anomaly.service';
import type { AnomalyCluster } from './anomaly.service';

/** Detección de Anomalías / Clusterización (plan `2.txt`, módulo 4): muestra los
 * clústeres de tickets similares detectados por `ai-service/app/workers/anomaly_scheduler.py`
 * — posibles caídas masivas de un servicio o red. */
@Component({
  selector: 'app-anomaly-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './anomaly-dashboard.component.html',
})
export class AnomalyDashboardComponent {
  private readonly anomalyService = inject(AnomalyService);

  readonly clusters = signal<AnomalyCluster[]>([]);

  constructor() {
    this.anomalyService.list().subscribe((clusters) => this.clusters.set(clusters));
  }

  severityClasses(severity: string): string {
    return severity === 'critical' ? 'bg-status-incident-bg text-status-incident' : 'bg-status-warning-bg text-status-warning';
  }
}
