import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SurveyService } from './survey.service';
import type { Survey, SurveyStats } from './survey.service';

/** Encuestas de Satisfacción / CSAT (plan `1.txt`, Fase 2): panel para que
 * ADMIN/TECHNICIAN revisen el promedio de satisfacción, la tasa de respuesta y
 * los comentarios de los usuarios tras el cierre de cada ticket. */
@Component({
  selector: 'app-survey-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './survey-dashboard.component.html',
})
export class SurveyDashboardComponent {
  private readonly surveyService = inject(SurveyService);

  readonly stats = signal<SurveyStats | null>(null);
  readonly surveys = signal<Survey[]>([]);

  readonly scoreLevels = [5, 4, 3, 2, 1];

  constructor() {
    this.surveyService.getStats().subscribe((stats) => this.stats.set(stats));
    this.surveyService.list().subscribe((surveys) => this.surveys.set(surveys));
  }

  distributionPercent(score: number): number {
    const stats = this.stats();
    if (!stats || stats.totalResponded === 0) return 0;
    return Math.round(((stats.distribution[score] ?? 0) / stats.totalResponded) * 100);
  }
}
