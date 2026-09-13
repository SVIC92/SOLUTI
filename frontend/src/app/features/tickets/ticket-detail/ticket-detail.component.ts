import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import type { TicketDetail } from '../../../core/models/ticket.model';
import { AuthService } from '../../../core/auth/auth.service';
import type { Asset } from '../../assets/asset.service';
import { AssetService } from '../../assets/asset.service';
import { SurveyService } from '../../surveys/survey.service';
import type { Survey } from '../../surveys/survey.service';
import { CopilotService } from '../copilot.service';
import type { SimilarTicketResult } from '../copilot.service';
import { TicketService } from '../ticket.service';
import type { SlaStatus } from '../ticket.service';

/** Detalle de Ticket — replica el diseño "NovaDesk AI": cabecera con acciones de
 * estado, descripción original, hilo de comentarios (público/interno), historial,
 * estado de cumplimiento de SLA y vínculo a un activo del CMDB (plan `1.txt`, Fase 2).
 * El panel de Copilot IA del diseño original se conecta cuando exista ai-service. */
@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './ticket-detail.component.html',
})
export class TicketDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly ticketService = inject(TicketService);
  private readonly assetService = inject(AssetService);
  private readonly surveyService = inject(SurveyService);
  private readonly copilotService = inject(CopilotService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  // Se recalcula en cada cambio de `:id` en el constructor — nunca leer el
  // snapshot una sola vez, ver el fix de `reload()`/suscripción a `paramMap`.
  private ticketId = '';

  readonly ticket = signal<TicketDetail | null>(null);
  readonly slaStatus = signal<SlaStatus | null>(null);
  readonly assets = signal<Asset[]>([]);
  readonly survey = signal<Survey | null>(null);
  readonly isInternalNote = signal(false);
  readonly showAssetPicker = signal(false);
  readonly selectedRating = signal(0);
  readonly loadError = signal<string | null>(null);

  readonly similarTickets = signal<SimilarTicketResult[]>([]);
  readonly copilotDraft = signal<string | null>(null);
  readonly searchingSimilar = signal(false);
  readonly generatingDraft = signal(false);

  commentForm = this.fb.nonNullable.group({
    body: ['', Validators.required],
  });

  assetForm = this.fb.nonNullable.group({
    assetId: ['', Validators.required],
  });

  surveyForm = this.fb.nonNullable.group({
    comment: [''],
  });

  copilotForm = this.fb.nonNullable.group({
    notes: ['', Validators.required],
  });

  get isRequester(): boolean {
    return this.ticket()?.createdById === this.auth.currentUser?.sub;
  }

  /** El Usuario Final nunca gestiona el ticket (resolver/cerrar/vincular activo/notas internas) — solo lo consulta y responde. */
  get isStaff(): boolean {
    const role = this.auth.currentUser?.role;
    return role === 'ADMIN' || role === 'TECHNICIAN';
  }

  get canUseCopilot(): boolean {
    return this.isStaff;
  }

  constructor() {
    // Antes: `this.route.snapshot.paramMap.get('id')!` se leía UNA sola vez en el
    // constructor. Angular reutiliza la misma instancia de componente al navegar
    // entre `tickets/:id` con distinto `id` (misma config de ruta), así que sin
    // esta suscripción la vista se quedaba mostrando el ticket anterior con la
    // URL ya apuntando al nuevo.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id');
      if (!id) return;
      this.ticketId = id;
      this.ticket.set(null);
      this.slaStatus.set(null);
      this.survey.set(null);
      this.similarTickets.set([]);
      this.copilotDraft.set(null);
      this.loadError.set(null);
      this.reload();
    });
    this.assetService
      .list()
      .pipe(catchError(() => of([])))
      .subscribe((assets) => this.assets.set(assets));
  }

  private reload(): void {
    this.ticketService
      .getById(this.ticketId)
      .pipe(catchError(() => of(null)))
      .subscribe((ticket) => {
        if (!ticket) {
          this.loadError.set('No se pudo cargar el ticket. Verifica el enlace o tus permisos.');
          return;
        }
        this.ticket.set(ticket);
        // La encuesta CSAT solo existe una vez el ticket se cierra (ver plan, Fase 2).
        if (ticket.status === 'CLOSED') {
          this.surveyService
            .getForTicket(this.ticketId)
            .pipe(catchError(() => of(null)))
            .subscribe((survey) => this.survey.set(survey));
        }
      });
    this.ticketService
      .getSlaStatus(this.ticketId)
      .pipe(catchError(() => of(null)))
      .subscribe((status) => this.slaStatus.set(status));
  }

  toggleNoteType(isInternal: boolean): void {
    this.isInternalNote.set(isInternal);
  }

  submitComment(): void {
    if (this.commentForm.invalid) return;
    const { body } = this.commentForm.getRawValue();

    this.ticketService.addComment(this.ticketId, body, this.isInternalNote()).subscribe({
      next: () => {
        this.commentForm.reset();
        this.reload();
      },
      error: () => this.loadError.set('No se pudo enviar el comentario. Inténtalo nuevamente.'),
    });
  }

  updateStatus(status: string): void {
    this.ticketService.updateStatus(this.ticketId, status).subscribe({
      next: () => this.reload(),
      error: () => this.loadError.set('No se pudo actualizar el estado del ticket.'),
    });
  }

  toggleAssetPicker(): void {
    this.showAssetPicker.update((v) => !v);
  }

  linkAsset(): void {
    if (this.assetForm.invalid) return;
    const { assetId } = this.assetForm.getRawValue();

    this.ticketService.linkAsset(this.ticketId, assetId).subscribe({
      next: () => {
        this.showAssetPicker.set(false);
        this.reload();
      },
      error: () => this.loadError.set('No se pudo vincular el activo seleccionado.'),
    });
  }

  setRating(score: number): void {
    this.selectedRating.set(score);
  }

  submitSurvey(): void {
    if (this.selectedRating() === 0) return;
    const { comment } = this.surveyForm.getRawValue();

    this.surveyService.respond(this.ticketId, this.selectedRating(), comment || undefined).subscribe({
      next: (survey) => this.survey.set(survey),
      error: () => this.loadError.set('No se pudo enviar la calificación.'),
    });
  }

  searchSimilarTickets(): void {
    const { notes } = this.copilotForm.getRawValue();
    if (!notes) return;

    this.searchingSimilar.set(true);
    this.copilotService.searchSimilar(notes, this.ticket()?.categoryId).subscribe({
      next: (response) => {
        this.similarTickets.set(response.results);
        this.searchingSimilar.set(false);
      },
      error: () => this.searchingSimilar.set(false),
    });
  }

  generateDraft(): void {
    const { notes } = this.copilotForm.getRawValue();
    if (!notes) return;

    this.generatingDraft.set(true);
    this.copilotService.draft(this.ticketId, notes).subscribe({
      next: (response) => {
        this.copilotDraft.set(response.draft);
        this.generatingDraft.set(false);
      },
      error: () => this.generatingDraft.set(false),
    });
  }

  insertDraftIntoReply(): void {
    const draft = this.copilotDraft();
    if (!draft) return;

    this.isInternalNote.set(false);
    this.commentForm.patchValue({ body: draft });
  }

  /** SLA vencido → rojo; a menos de 60 min → amarillo; en tiempo → verde. */
  slaClasses(): string {
    const status = this.slaStatus();
    if (!status?.policy) return 'bg-surface-container text-on-surface-variant';
    if (status.resolutionBreached) return 'bg-status-incident-bg text-status-incident';
    if (status.resolutionMinutesRemaining !== null && status.resolutionMinutesRemaining < 60) {
      return 'bg-status-warning-bg text-status-warning';
    }
    return 'bg-status-resolved-bg text-status-resolved';
  }

  /** Traduce el puntaje de sentimiento IA (-1..1) a una etiqueta legible. */
  sentimentLabel(score?: number | null): string {
    if (score === undefined || score === null) return 'Sin analizar';
    if (score < -0.3) return 'Frustrado';
    if (score > 0.3) return 'Satisfecho';
    return 'Neutral';
  }

  sentimentIcon(score?: number | null): string {
    if (score === undefined || score === null) return 'psychology';
    if (score < -0.3) return 'sentiment_very_dissatisfied';
    if (score > 0.3) return 'sentiment_satisfied';
    return 'sentiment_neutral';
  }

  sentimentClasses(score?: number | null): string {
    if (score === undefined || score === null) return 'text-on-surface-variant';
    if (score < -0.3) return 'text-status-incident';
    if (score > 0.3) return 'text-status-resolved';
    return 'text-on-surface-variant';
  }

  priorityClasses(priority?: string): string {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-status-incident-bg text-status-incident';
      case 'HIGH':
        return 'bg-status-warning-bg text-status-warning';
      default:
        return 'bg-surface-container-high text-primary';
    }
  }
}
