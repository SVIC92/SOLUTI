import { createHmac, timingSafeEqual } from 'node:crypto';
import type { InboundChannelMessage } from './channel-adapter.interface.js';

/**
 * Verifica `X-Hub-Signature-256` (Meta/WhatsApp Cloud API): el proveedor firma
 * el body crudo con HMAC-SHA256 usando el App Secret. Comparación en tiempo
 * constante para no filtrar por timing cuánto del hash coincide — mismo motivo
 * que `ServiceApiKeyGuard` (ver `common/guards/service-api-key.guard.ts`).
 */
export function verifyWhatsappSignature(appSecret: string, rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const provided = signatureHeader.slice('sha256='.length);

  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}

interface WhatsappWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{ from?: string; type?: string; text?: { body?: string } }>;
      };
    }>;
  }>;
}

/** Solo se procesan mensajes de texto — llamadas, imágenes, ubicación, etc. se
 * ignoran por ahora (no hay forma de convertirlas en la descripción de un
 * ticket sin un paso de transcripción/OCR adicional, fuera de alcance). */
export function parseWhatsappInbound(body: unknown): InboundChannelMessage[] {
  const messages: InboundChannelMessage[] = [];
  if (!body || typeof body !== 'object') return messages;

  const payload = body as WhatsappWebhookPayload;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;

      const contacts = change.value?.contacts ?? [];
      for (const message of change.value?.messages ?? []) {
        if (message.type !== 'text' || !message.from || !message.text?.body) continue;

        const contact = contacts.find((c) => c.wa_id === message.from);
        messages.push({
          channel: 'WHATSAPP',
          externalUserId: message.from,
          externalConversationId: message.from,
          senderDisplayName: contact?.profile?.name ?? message.from,
          text: message.text.body,
        });
      }
    }
  }

  return messages;
}
