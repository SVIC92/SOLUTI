import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import type { ChannelAdapter, ChannelName, RawWebhookRequest } from './adapters/channel-adapter.interface.js';
import { slackVerificationChallenge } from './adapters/slack.util.js';
import { ChannelsService } from './channels.service.js';

/**
 * Webhooks públicos del Portal Multi-canal (plan `1.txt`) — WhatsApp/Slack/
 * Teams los invocan directamente, no un usuario autenticado con JWT. La
 * autenticidad de cada request se verifica con el esquema propio de cada
 * proveedor (`ChannelAdapter.verifyRequest`), no con `JwtAuthGuard`.
 *
 * Excluido de Swagger: no es una API para consumo interno del frontend.
 */
@ApiExcludeController()
@Controller('channels')
export class ChannelsController {
  private readonly logger = new Logger('ChannelsController');

  constructor(private readonly channelsService: ChannelsService) {}

  /** Meta verifica la URL del webhook de WhatsApp con un GET antes de empezar
   * a enviar eventos — ver `WhatsappAdapter.handleVerificationChallenge`. */
  @Get('whatsapp/webhook')
  verifyWhatsapp(@Query() query: Record<string, string>) {
    const adapter = this.channelsService.getAdapter('WHATSAPP');
    const challenge = adapter.handleVerificationChallenge?.(query) ?? null;
    if (challenge === null) {
      throw new UnauthorizedException('Token de verificación inválido');
    }
    return challenge;
  }

  @Post('whatsapp/webhook')
  @HttpCode(HttpStatus.OK)
  async whatsappWebhook(@Req() req: RawBodyRequest<Request>) {
    return this.handleWebhook('WHATSAPP', req);
  }

  @Post('slack/webhook')
  @HttpCode(HttpStatus.OK)
  async slackWebhook(@Req() req: RawBodyRequest<Request>) {
    const adapter = this.channelsService.getAdapter('SLACK');
    if (!adapter.isConfigured) throw new ServiceUnavailableException('El canal Slack no está configurado');

    const verified = await adapter.verifyRequest(this.toRawWebhookRequest(req));
    if (!verified) throw new UnauthorizedException('Firma de Slack inválida');

    // El handshake de verificación de URL de Slack (una sola vez, al configurar
    // la Events API) llega firmado igual que cualquier evento, pero espera de
    // vuelta `{ challenge }` en vez de que se procese como mensaje.
    const challenge = slackVerificationChallenge(req.body);
    if (challenge !== null) return { challenge };

    return this.processInbound(adapter, req.body);
  }

  @Post('teams/webhook')
  @HttpCode(HttpStatus.OK)
  async teamsWebhook(@Req() req: RawBodyRequest<Request>) {
    return this.handleWebhook('TEAMS', req);
  }

  private async handleWebhook(channelName: ChannelName, req: RawBodyRequest<Request>) {
    const adapter = this.channelsService.getAdapter(channelName);
    if (!adapter.isConfigured) throw new ServiceUnavailableException(`El canal ${channelName} no está configurado`);

    const verified = await adapter.verifyRequest(this.toRawWebhookRequest(req));
    if (!verified) throw new UnauthorizedException('Firma/token inválido');

    return this.processInbound(adapter, req.body);
  }

  private async processInbound(adapter: ChannelAdapter, body: unknown) {
    const messages = adapter.parseInbound(body);
    const createdTicketCodes: string[] = [];

    for (const message of messages) {
      const { ticketCode } = await this.channelsService.handleInboundMessage(message);
      createdTicketCodes.push(ticketCode);

      // La respuesta de confirmación nunca debe tumbar el webhook — el ticket
      // ya se creó; `sendReply` ya maneja sus propios errores internamente.
      await adapter.sendReply(
        message.externalConversationId,
        `Hemos creado tu ticket ${ticketCode}. Un técnico de soporte te contactará pronto.`,
      );
    }

    return { created: createdTicketCodes };
  }

  private toRawWebhookRequest(req: RawBodyRequest<Request>): RawWebhookRequest {
    if (!req.rawBody) {
      // Solo puede pasar si `rawBody: true` no se habilitó en `NestFactory.create()`
      // (ver main.ts) — es un error de configuración, no un request malformado.
      throw new BadRequestException('No se pudo leer el cuerpo crudo de la request');
    }
    return {
      rawBody: req.rawBody,
      body: req.body,
      headers: req.headers as Record<string, string | string[] | undefined>,
      query: req.query as Record<string, string | undefined>,
    };
  }
}
