import jwt from 'jsonwebtoken';
import type { InboundChannelMessage } from './channel-adapter.interface.js';

/** El emisor de los tokens que el Bot Framework Connector adjunta a cada
 * Activity entrante — es un valor fijo documentado por Microsoft, no depende
 * del tenant/app del cliente. */
export const BOT_FRAMEWORK_ISSUER = 'https://api.botframework.com';

export interface TeamsActivity {
  type?: string;
  text?: string;
  from?: { id?: string; name?: string; aadObjectId?: string };
  conversation?: { id?: string };
  serviceUrl?: string;
}

/** Solo se procesan Activities de tipo `message` con texto — Teams también
 * envía `conversationUpdate` (alguien se unió/salió), `typing`, reacciones,
 * tarjetas adaptativas, etc., que no se traducen en un ticket. */
export function parseTeamsInbound(body: unknown): InboundChannelMessage[] {
  if (!body || typeof body !== 'object') return [];
  const activity = body as TeamsActivity;

  if (activity.type !== 'message' || !activity.text || !activity.from?.id || !activity.conversation?.id || !activity.serviceUrl) {
    return [];
  }

  return [
    {
      channel: 'TEAMS',
      externalUserId: activity.from.aadObjectId ?? activity.from.id,
      // Responder requiere tanto el `serviceUrl` (cada tenant/región de Teams
      // tiene el suyo) como el `conversation.id` — se empaquetan juntos porque
      // no hay dónde más guardar esta referencia (ver TeamsAdapter.sendReply).
      externalConversationId: `${activity.serviceUrl}::${activity.conversation.id}`,
      senderDisplayName: activity.from.name ?? activity.from.id,
      text: activity.text,
    },
  ];
}

/**
 * Verifica el JWT que el Bot Framework Connector adjunta a cada request
 * entrante (`Authorization: Bearer <token>`). `getSigningKey` resuelve la
 * clave pública RS256 correspondiente al `kid` del header del token — en
 * producción, contra el JWKS de Microsoft (ver `TeamsAdapter`); en tests,
 * contra un par de claves generado localmente, sin red.
 *
 * https://learn.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-connector-authentication
 */
export function verifyTeamsJwt(
  token: string,
  options: { appId: string; getSigningKey: (kid: string) => Promise<string> },
): Promise<boolean> {
  return new Promise((resolve) => {
    jwt.verify(
      token,
      (header, callback) => {
        if (!header.kid) {
          callback(new Error('El token no trae "kid" en el header'));
          return;
        }
        options
          .getSigningKey(header.kid)
          .then((key) => callback(null, key))
          .catch((err) => callback(err as Error));
      },
      { algorithms: ['RS256'], issuer: BOT_FRAMEWORK_ISSUER, audience: options.appId },
      (err) => resolve(!err),
    );
  });
}
