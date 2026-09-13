import { createHmac, timingSafeEqual } from 'node:crypto';
import type { InboundChannelMessage } from './channel-adapter.interface.js';

const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60; // Slack recomienda rechazar requests con más de 5 min de diferencia (replay)

/**
 * Verifica `X-Slack-Signature` (Events API):
 * `v0=HMAC-SHA256(signingSecret, "v0:" + timestamp + ":" + rawBody)`.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(params: {
  signingSecret: string;
  rawBody: Buffer;
  timestampHeader: string | undefined;
  signatureHeader: string | undefined;
  nowSeconds: number;
}): boolean {
  const { signingSecret, rawBody, timestampHeader, signatureHeader, nowSeconds } = params;
  if (!timestampHeader || !signatureHeader?.startsWith('v0=')) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > MAX_TIMESTAMP_SKEW_SECONDS) return false;

  const baseString = `v0:${timestampHeader}:${rawBody.toString('utf8')}`;
  const expected = `v0=${createHmac('sha256', signingSecret).update(baseString).digest('hex')}`;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}

interface SlackEventPayload {
  type?: string;
  challenge?: string;
  event?: {
    type?: string;
    subtype?: string;
    bot_id?: string;
    user?: string;
    channel?: string;
    text?: string;
  };
}

/** Si la request es el "URL verification handshake" que Slack hace una sola
 * vez al configurar la Events API, devuelve el challenge a responder tal cual
 * (como JSON `{ challenge }`) — si no, `null` y se sigue el flujo normal. */
export function slackVerificationChallenge(body: unknown): string | null {
  const payload = body as SlackEventPayload;
  return payload?.type === 'url_verification' ? (payload.challenge ?? null) : null;
}

/** Ignora mensajes que no son de un humano escribiendo texto: los que vienen
 * con `bot_id` (incluida nuestra propia respuesta automática — sin este
 * filtro, el bot terminaría respondiéndose a sí mismo en bucle) y los
 * `subtype` de sistema (edición, unión al canal, etc.). */
export function parseSlackInbound(body: unknown): InboundChannelMessage[] {
  const payload = body as SlackEventPayload;
  if (payload?.type !== 'event_callback') return [];

  const event = payload.event;
  if (!event || event.type !== 'message' || event.subtype || event.bot_id) return [];
  if (!event.user || !event.channel || !event.text) return [];

  return [
    {
      channel: 'SLACK',
      externalUserId: event.user,
      externalConversationId: event.channel,
      senderDisplayName: event.user, // el nombre real requiere una llamada a `users.info` — ver SlackAdapter
      text: event.text,
    },
  ];
}
