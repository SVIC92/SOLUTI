import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import jwksClient from 'jwks-rsa';
import type { ChannelAdapter, InboundChannelMessage, RawWebhookRequest } from './channel-adapter.interface.js';
import { parseTeamsInbound, verifyTeamsJwt } from './teams.util.js';

// Endpoint JWKS estable y documentado por Microsoft para validar tokens del
// Bot Framework Connector — no depende del tenant/app del cliente, por eso se
// puede fijar directo en vez de resolverlo desde el documento OpenID Connect.
// https://learn.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-connector-authentication
const BOT_FRAMEWORK_JWKS_URI = 'https://login.botframework.com/v1/keys';
const BOT_FRAMEWORK_TOKEN_URL = 'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token';

/**
 * Microsoft Teams (Bot Framework) — plan `1.txt`, "Portal Multi-canal /
 * Integraciones". Requiere un bot registrado en Azure Bot Service (App ID +
 * contraseña de cliente) para que Teams enrute mensajes hacia nuestro webhook.
 *
 * ⚠️ No se pudo registrar ni probar contra un bot de Teams real en este
 * entorno (requiere una app de Azure AD aprobada). La verificación de JWT
 * sigue el protocolo documentado (`teams.util.spec.ts` lo prueba de punta a
 * punta con claves locales); el envío de respuestas (OAuth2 + Bot Connector
 * REST API) no se pudo ejercitar contra el servicio real.
 */
@Injectable()
export class TeamsAdapter implements ChannelAdapter {
  readonly channel = 'TEAMS' as const;
  private readonly logger = new Logger('ChannelsAdapter:Teams');
  private readonly jwks = jwksClient({ jwksUri: BOT_FRAMEWORK_JWKS_URI, cache: true, rateLimit: true });

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return !!this.config.get<string>('TEAMS_APP_ID') && !!this.config.get<string>('TEAMS_APP_PASSWORD');
  }

  handleVerificationChallenge(): string | null {
    return null; // Teams no tiene un handshake de verificación por GET como WhatsApp.
  }

  async verifyRequest(req: RawWebhookRequest): Promise<boolean> {
    const appId = this.config.get<string>('TEAMS_APP_ID');
    if (!appId) return false;

    const authHeader = req.headers.authorization;
    const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (!header?.startsWith('Bearer ')) return false;

    const token = header.slice('Bearer '.length);
    return verifyTeamsJwt(token, {
      appId,
      getSigningKey: async (kid) => {
        const key = await this.jwks.getSigningKey(kid);
        return key.getPublicKey();
      },
    });
  }

  parseInbound(body: unknown): InboundChannelMessage[] {
    return parseTeamsInbound(body);
  }

  private async getConnectorAccessToken(): Promise<string | null> {
    const appId = this.config.get<string>('TEAMS_APP_ID');
    const appPassword = this.config.get<string>('TEAMS_APP_PASSWORD');
    if (!appId || !appPassword) return null;

    try {
      const response = await axios.post(
        BOT_FRAMEWORK_TOKEN_URL,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: appId,
          client_secret: appPassword,
          scope: 'https://api.botframework.com/.default',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 },
      );
      return response.data?.access_token ?? null;
    } catch (error) {
      this.logger.error(`No se pudo obtener un token OAuth2 para el Bot Connector: ${(error as Error).message}`);
      return null;
    }
  }

  async sendReply(externalConversationId: string, text: string): Promise<void> {
    const [serviceUrl, conversationId] = externalConversationId.split('::');
    if (!serviceUrl || !conversationId) {
      this.logger.error(`externalConversationId de Teams con formato inesperado: ${externalConversationId}`);
      return;
    }

    const accessToken = await this.getConnectorAccessToken();
    if (!accessToken) {
      this.logger.warn('No se configuró TEAMS_APP_ID/TEAMS_APP_PASSWORD; se omite la respuesta automática');
      return;
    }

    try {
      await axios.post(
        `${serviceUrl.replace(/\/$/, '')}/v3/conversations/${conversationId}/activities`,
        { type: 'message', text },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 8000 },
      );
    } catch (error) {
      this.logger.error(`No se pudo enviar la confirmación por Teams: ${(error as Error).message}`);
    }
  }
}
