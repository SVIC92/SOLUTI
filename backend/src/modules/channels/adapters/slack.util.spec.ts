import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseSlackInbound, slackVerificationChallenge, verifySlackSignature } from './slack.util.js';

describe('verifySlackSignature', () => {
  const signingSecret = 'test-signing-secret';
  const rawBody = Buffer.from('payload=%7B%22foo%22%3A%22bar%22%7D');
  const timestamp = '1699999999';

  function sign(ts: string, body: Buffer): string {
    return `v0=${createHmac('sha256', signingSecret).update(`v0:${ts}:${body.toString('utf8')}`).digest('hex')}`;
  }

  it('acepta una firma válida dentro de la ventana de tiempo', () => {
    const ok = verifySlackSignature({
      signingSecret,
      rawBody,
      timestampHeader: timestamp,
      signatureHeader: sign(timestamp, rawBody),
      nowSeconds: Number(timestamp) + 10,
    });
    expect(ok).toBe(true);
  });

  it('rechaza una firma calculada con otro signing secret', () => {
    const wrongSig = `v0=${createHmac('sha256', 'otro-secreto').update(`v0:${timestamp}:${rawBody.toString('utf8')}`).digest('hex')}`;
    const ok = verifySlackSignature({
      signingSecret,
      rawBody,
      timestampHeader: timestamp,
      signatureHeader: wrongSig,
      nowSeconds: Number(timestamp),
    });
    expect(ok).toBe(false);
  });

  it('rechaza un timestamp demasiado viejo (protección de replay)', () => {
    const ok = verifySlackSignature({
      signingSecret,
      rawBody,
      timestampHeader: timestamp,
      signatureHeader: sign(timestamp, rawBody),
      nowSeconds: Number(timestamp) + 999_999,
    });
    expect(ok).toBe(false);
  });

  it('rechaza si faltan los headers', () => {
    expect(
      verifySlackSignature({ signingSecret, rawBody, timestampHeader: undefined, signatureHeader: undefined, nowSeconds: 0 }),
    ).toBe(false);
  });
});

describe('slackVerificationChallenge', () => {
  it('devuelve el challenge cuando es el handshake de verificación de URL', () => {
    expect(slackVerificationChallenge({ type: 'url_verification', challenge: 'abc123' })).toBe('abc123');
  });

  it('devuelve null para cualquier otro tipo de evento', () => {
    expect(slackVerificationChallenge({ type: 'event_callback' })).toBeNull();
  });
});

describe('parseSlackInbound', () => {
  it('extrae un mensaje humano válido', () => {
    const payload = {
      type: 'event_callback',
      event: { type: 'message', user: 'U123', channel: 'C456', text: 'Necesito ayuda con mi VPN' },
    };
    expect(parseSlackInbound(payload)).toEqual([
      { channel: 'SLACK', externalUserId: 'U123', externalConversationId: 'C456', senderDisplayName: 'U123', text: 'Necesito ayuda con mi VPN' },
    ]);
  });

  it('ignora mensajes de bots (evita que el bot se responda a sí mismo)', () => {
    const payload = { type: 'event_callback', event: { type: 'message', bot_id: 'B999', user: 'U123', channel: 'C456', text: 'hola' } };
    expect(parseSlackInbound(payload)).toEqual([]);
  });

  it('ignora subtipos de sistema (ediciones, join de canal, etc.)', () => {
    const payload = { type: 'event_callback', event: { type: 'message', subtype: 'message_changed', user: 'U123', channel: 'C456' } };
    expect(parseSlackInbound(payload)).toEqual([]);
  });

  it('ignora cualquier request que no sea event_callback', () => {
    expect(parseSlackInbound({ type: 'url_verification', challenge: 'x' })).toEqual([]);
  });
});
