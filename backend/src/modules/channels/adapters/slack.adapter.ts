import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { ChannelAdapter, InboundChannelMessage, RawWebhookRequest } from './channel-adapter.interface.js';
import { parseSlackInbound, verifySlackSignature } from './slack.util.js';

/**
 * Slack Events API — plan `1.txt`, "Portal Multi-canal / Integraciones".
 * https://api.slack.com/apis/connections/events-api
 *
 * ⚠️ No se pudo probar contra un workspace de Slack real en este entorno.
 * Firma y parseo siguen el formato documentado; validar contra un app de
 * pruebas de Slack antes de producción.
 */
@Injectable()
export class SlackAdapter implements ChannelAdapter {
  readonly channel = 'SLACK' as const;
  private readonly logger = new Logger('ChannelsAdapter:Slack');

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return !!this.config.get<string>('SLACK_SIGNING_SECRET');
  }

  /** A diferencia de WhatsApp, el handshake de Slack llega como POST con
   * `{ type: 'url_verification', challenge }` — el controller lo detecta
   * revisando el body ya parseado, no la querystring. Se expone igual para
   * cumplir la interfaz común, pero `ChannelsController` llama a
   * `slackVerificationChallenge` directamente sobre el body en el flujo POST. */
  handleVerificationChallenge(): string | null {
    return null;
  }

  async verifyRequest(req: RawWebhookRequest): Promise<boolean> {
    const signingSecret = this.config.get<string>('SLACK_SIGNING_SECRET');
    if (!signingSecret) return false;

    const timestamp = req.headers['x-slack-request-timestamp'];
    const signature = req.headers['x-slack-signature'];

    return verifySlackSignature({
      signingSecret,
      rawBody: req.rawBody,
      timestampHeader: Array.isArray(timestamp) ? timestamp[0] : timestamp,
      signatureHeader: Array.isArray(signature) ? signature[0] : signature,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
  }

  parseInbound(body: unknown): InboundChannelMessage[] {
    return parseSlackInbound(body);
  }

  /** Slack solo entrega el ID del usuario en el evento — el nombre real
   * requiere una llamada aparte a `users.info`. Es un best-effort: si falla o
   * no hay `SLACK_BOT_TOKEN`, se sigue con el ID como nombre (ya cubierto por
   * `parseSlackInbound`), nunca bloquea la creación del ticket. */
  async resolveDisplayName(userId: string): Promise<string> {
    const token = this.config.get<string>('SLACK_BOT_TOKEN');
    if (!token) return userId;

    try {
      const response = await axios.get('https://slack.com/api/users.info', {
        params: { user: userId },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      });
      const name = response.data?.user?.real_name ?? response.data?.user?.profile?.display_name;
      return typeof name === 'string' && name.length > 0 ? name : userId;
    } catch (error) {
      this.logger.warn(`No se pudo resolver el nombre de Slack para ${userId}: ${(error as Error).message}`);
      return userId;
    }
  }

  async sendReply(externalConversationId: string, text: string): Promise<void> {
    const token = this.config.get<string>('SLACK_BOT_TOKEN');
    if (!token) {
      this.logger.warn('No se configuró SLACK_BOT_TOKEN; se omite la respuesta automática');
      return;
    }

    try {
      await axios.post(
        'https://slack.com/api/chat.postMessage',
        { channel: externalConversationId, text },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 },
      );
    } catch (error) {
      this.logger.error(`No se pudo enviar la confirmación por Slack: ${(error as Error).message}`);
    }
  }
}
