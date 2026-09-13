import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseWhatsappInbound, verifyWhatsappSignature } from './whatsapp.util.js';

describe('verifyWhatsappSignature', () => {
  const appSecret = 'test-app-secret';

  function sign(body: Buffer): string {
    return `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`;
  }

  it('acepta una firma calculada correctamente sobre el body crudo', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    expect(verifyWhatsappSignature(appSecret, body, sign(body))).toBe(true);
  });

  it('rechaza si el secreto no coincide', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    const wrongSignature = `sha256=${createHmac('sha256', 'otro-secreto').update(body).digest('hex')}`;
    expect(verifyWhatsappSignature(appSecret, body, wrongSignature)).toBe(false);
  });

  it('rechaza si el body fue alterado después de firmarse', () => {
    const original = Buffer.from(JSON.stringify({ hello: 'world' }));
    const tampered = Buffer.from(JSON.stringify({ hello: 'mundo' }));
    expect(verifyWhatsappSignature(appSecret, tampered, sign(original))).toBe(false);
  });

  it('rechaza si falta el header o no tiene el prefijo esperado', () => {
    const body = Buffer.from('{}');
    expect(verifyWhatsappSignature(appSecret, body, undefined)).toBe(false);
    expect(verifyWhatsappSignature(appSecret, body, 'sha1=deadbeef')).toBe(false);
  });
});

describe('parseWhatsappInbound', () => {
  it('extrae un mensaje de texto con el nombre del contacto', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ profile: { name: 'Juan Pérez' }, wa_id: '51999999999' }],
                messages: [{ from: '51999999999', type: 'text', text: { body: 'No puedo entrar a la VPN' } }],
              },
            },
          ],
        },
      ],
    };

    const messages = parseWhatsappInbound(payload);

    expect(messages).toEqual([
      {
        channel: 'WHATSAPP',
        externalUserId: '51999999999',
        externalConversationId: '51999999999',
        senderDisplayName: 'Juan Pérez',
        text: 'No puedo entrar a la VPN',
      },
    ]);
  });

  it('ignora mensajes que no son de texto (imágenes, audio, ubicación, etc.)', () => {
    const payload = {
      entry: [{ changes: [{ field: 'messages', value: { messages: [{ from: '51999999999', type: 'image' }] } }] }],
    };
    expect(parseWhatsappInbound(payload)).toEqual([]);
  });

  it('ignora cambios que no son del campo "messages" (ej. actualizaciones de estado)', () => {
    const payload = { entry: [{ changes: [{ field: 'message_status_updates', value: {} }] }] };
    expect(parseWhatsappInbound(payload)).toEqual([]);
  });

  it('usa el número como nombre si no viene el perfil del contacto', () => {
    const payload = {
      entry: [
        { changes: [{ field: 'messages', value: { messages: [{ from: '51999999999', type: 'text', text: { body: 'hola' } }] } }] },
      ],
    };
    expect(parseWhatsappInbound(payload)[0].senderDisplayName).toBe('51999999999');
  });

  it('no lanza con un payload vacío o inesperado', () => {
    expect(parseWhatsappInbound({})).toEqual([]);
    expect(parseWhatsappInbound(null)).toEqual([]);
  });
});
