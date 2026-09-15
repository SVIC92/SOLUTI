import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Ticket, TicketStatus } from '../../../core/models/ticket.model';
import { TicketService } from '../ticket.service';

interface StatusTab {
  key: TicketStatus | 'ALL';
  label: string;
}

const STATUS_TABS: StatusTab[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'NEW', label: 'Nuevos' },
  { key: 'IN_PROGRESS', label: 'En Proceso' },
  { key: 'ON_HOLD', label: 'En Espera' },
  { key: 'RESOLVED', label: 'Resueltos' },
  { key: 'CLOSED', label: 'Cerrados' },
];

/** Gestión de Tickets — replica el diseño "SoluTI_AI" (tabs de estado, filtros,
 * tabla densa con badges de prioridad/estado) sobre datos reales del backend. */
@Component({
  selector: 'app-ticket-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './ticket-list.component.html',
})
export class TicketListComponent {
  private readonly ticketService = inject(TicketService);

  readonly statusTabs = STATUS_TABS;
  readonly activeTab = signal<StatusTab['key']>('ALL');
  readonly searchTerm = signal('');
  readonly tickets = signal<Ticket[]>([]);

  readonly filteredTickets = computed(() => {
    const tab = this.activeTab();
    const query = this.searchTerm().toLowerCase().trim();

    return this.tickets().filter((ticket) => {
      const matchesTab = tab === 'ALL' || ticket.status === tab;
      const matchesQuery =
        !query || ticket.code.toLowerCase().includes(query) || ticket.title.toLowerCase().includes(query);
      return matchesTab && matchesQuery;
    });
  });

  readonly countFor = computed(() => {
    const counts: Record<string, number> = { ALL: this.tickets().length };
    for (const ticket of this.tickets()) {
      counts[ticket.status] = (counts[ticket.status] ?? 0) + 1;
    }
    return counts;
  });

  constructor() {
    this.ticketService.list().subscribe((tickets) => this.tickets.set(tickets));
  }

  setTab(tab: StatusTab['key']): void {
    this.activeTab.set(tab);
  }

  onSearch(value: string): void {
    this.searchTerm.set(value);
  }

  priorityClasses(priority: Ticket['priority']): string {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-status-incident-bg text-status-incident';
      case 'HIGH':
        return 'bg-status-warning-bg text-status-warning';
      case 'MEDIUM':
        return 'bg-surface-container text-on-surface';
      default:
        return 'bg-surface-container-low text-on-surface-variant';
    }
  }

  statusClasses(status: Ticket['status']): string {
    switch (status) {
      case 'NEW':
        return 'bg-ai-purple-subtle text-ai-purple';
      case 'IN_PROGRESS':
        return 'bg-surface-container-high text-primary';
      case 'ON_HOLD':
        return 'bg-status-warning-bg text-status-warning';
      case 'RESOLVED':
      case 'CLOSED':
        return 'bg-status-resolved-bg text-status-resolved';
      default:
        return 'bg-surface-container text-on-surface';
    }
  }
}
