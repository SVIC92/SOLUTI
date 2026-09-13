import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { ChannelAdapter, InboundChannelMessage, RawWebhookRequest } from './channel-adapter.interface.js';
import { parseWhatsappInbound, verifyWhatsappSignature } from './whatsapp.util.js';

const GRAPH_API_VERSION = 'v21.0';

/**
 * WhatsApp Cloud API (Meta) — plan `1.txt`, "Portal Multi-canal / Integraciones".
 * Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * ⚠️ No se pudo probar contra una cuenta de WhatsApp Business real en este
 * entorno (requiere un número verificado y una app de Meta aprobada). La
 * verificación de firma y el parseo siguen el formato documentado del
 * proveedor; antes de producción, validar contra el sandbox real de Meta.
 */
@Injectable()
export class WhatsappAdapter implements ChannelAdapter {
  readonly channel = 'WHATSAPP' as const;
  private readonly logger = new Logger('ChannelsAdapter:WhatsApp');

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return !!this.config.get<string>('WHATSAPP_APP_SECRET');
  }

  /** Meta valida la URL del webhook con un GET antes de empezar a enviar
   * eventos: hay que devolver `hub.challenge` tal cual si `hub.verify_token`
   * coincide con el configurado. */
  handleVerificationChallenge(query: Record<string, string | undefined>): string | null {
    if (query['hub.mode'] !== 'subscribe') return null;

    const expectedToken = this.config.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (!expectedToken || query['hub.verify_token'] !== expectedToken) return null;

    return query['hub.challenge'] ?? null;
  }

  async verifyRequest(req: RawWebhookRequest): Promise<boolean> {
    const appSecret = this.config.get<string>('WHATSAPP_APP_SECRET');
    if (!appSecret) return false;

    const signature = req.headers['x-hub-signature-256'];
    const header = Array.isArray(signature) ? signature[0] : signature;
    return verifyWhatsappSignature(appSecret, req.rawBody, header);
  }

  parseInbound(body: unknown): InboundChannelMessage[] {
    return parseWhatsappInbound(body);
  }

  async sendReply(externalConversationId: string, text: string): Promise<void> {
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (!accessToken || !phoneNumberId) {
      this.logger.warn('No se configuró WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID; se omite la respuesta automática');
      return;
    }

    try {
      await axios.post(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: externalConversationId,
          type: 'text',
          text: { body: text },
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 8000 },
      );
    } catch (error) {
      // Nunca debe tumbar la creación del ticket, que ya ocurrió — solo se
      // pierde la confirmación automática por WhatsApp.
      this.logger.error(`No se pudo enviar la confirmación por WhatsApp: ${(error as Error).message}`);
    }
  }
}
