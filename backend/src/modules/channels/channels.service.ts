import { Injectable, Logger } from '@nestjs/common';
import { ExternalIdentityService } from '../../common/external-identity/external-identity.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { TicketsService } from '../tickets/tickets.service.js';
import type { ChannelAdapter, ChannelName, InboundChannelMessage } from './adapters/channel-adapter.interface.js';
import { SlackAdapter } from './adapters/slack.adapter.js';
import { TeamsAdapter } from './adapters/teams.adapter.js';
import { WhatsappAdapter } from './adapters/whatsapp.adapter.js';

// Categoría genérica para tickets creados por un canal externo: nadie clasifica
// manualmente al escribir por WhatsApp/Slack/Teams. El Triaje IA (plan `2.txt`,
// módulo 1) sigue corriendo igual sobre `ticket.created` y sugiere una
// categoría más específica en `ai_ticket_analysis` — esta solo es el punto de
// partida, se creó perezosamente igual que `findOrCreateAiServiceUser`.
const DEFAULT_CATEGORY_NAME = 'Multicanal (Sin Clasificar)';
const MAX_TITLE_LENGTH = 80;

/**
 * Orquesta el Portal Multi-canal (plan `1.txt`): recibe un mensaje ya
 * normalizado (sin importar de qué canal vino, ver `InboundChannelMessage`),
 * aprovisiona/reutiliza la cuenta "sombra" del remitente, y crea el ticket.
 */
@Injectable()
export class ChannelsService {
  private readonly logger = new Logger('ChannelsService');
  private readonly adapters: Record<ChannelName, ChannelAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalIdentity: ExternalIdentityService,
    private readonly ticketsService: TicketsService,
    whatsapp: WhatsappAdapter,
    slack: SlackAdapter,
    teams: TeamsAdapter,
  ) {
    this.adapters = { WHATSAPP: whatsapp, SLACK: slack, TEAMS: teams };
  }

  getAdapter(channel: ChannelName): ChannelAdapter {
    return this.adapters[channel];
  }

  async handleInboundMessage(message: InboundChannelMessage): Promise<{ ticketCode: string }> {
    const user = await this.externalIdentity.findOrCreate({
      provider: message.channel,
      externalId: message.externalUserId,
      fullName: message.senderDisplayName,
      email: message.senderEmail,
    });

    const category = await this.getOrCreateDefaultCategory();

    // No pasa por el ValidationPipe (no es una request HTTP con este DTO), así
    // que el mínimo de 10 caracteres de `description` se garantiza a mano acá:
    // el prefijo por sí solo ya excede ese mínimo sin importar qué tan corto
    // sea el mensaje original.
    const ticket = await this.ticketsService.create(
      {
        title: this.buildTitle(message.text),
        description: `Mensaje recibido por ${message.channel} de ${message.senderDisplayName}:\n\n${message.text}`,
        categoryId: category.id,
      },
      user.id,
    );

    this.logger.log(`Ticket ${ticket.code} creado desde ${message.channel} (usuario externo ${message.externalUserId})`);
    return { ticketCode: ticket.code };
  }

  private buildTitle(text: string): string {
    const trimmed = text.trim();
    if (trimmed.length < 3) return 'Solicitud recibida por canal externo';
    return trimmed.length > MAX_TITLE_LENGTH ? `${trimmed.slice(0, MAX_TITLE_LENGTH - 3)}...` : trimmed;
  }

  private getOrCreateDefaultCategory() {
    return this.prisma.category.upsert({
      where: { name: DEFAULT_CATEGORY_NAME },
      update: {},
      create: { name: DEFAULT_CATEGORY_NAME },
    });
  }
}
