import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { BOT_FRAMEWORK_ISSUER, parseTeamsInbound, verifyTeamsJwt } from './teams.util.js';

/**
 * `verifyTeamsJwt` no depende de red (recibe `getSigningKey` como parámetro),
 * así que se puede probar de punta a punta con un par de claves RSA generado
 * localmente — sin mockear nada del Bot Framework real.
 */
describe('verifyTeamsJwt', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const appId = 'test-app-id';
  const kid = 'test-key-1';
  const getSigningKey = async (requestedKid: string) => {
    if (requestedKid !== kid) throw new Error('kid desconocido');
    return publicKey.export({ type: 'pkcs1', format: 'pem' }).toString();
  };

  function signToken(overrides: Partial<{ issuer: string; audience: string; expiresIn: number }> = {}): string {
    return jwt.sign({}, privateKey, {
      algorithm: 'RS256',
      keyid: kid,
      issuer: overrides.issuer ?? BOT_FRAMEWORK_ISSUER,
      audience: overrides.audience ?? appId,
      expiresIn: overrides.expiresIn ?? '5m',
    });
  }

  it('acepta un token firmado correctamente, con el issuer y audience esperados', async () => {
    const token = signToken();
    await expect(verifyTeamsJwt(token, { appId, getSigningKey })).resolves.toBe(true);
  });

  it('rechaza un token con audience incorrecta (no es nuestro App ID)', async () => {
    const token = signToken({ audience: 'otro-app-id' });
    await expect(verifyTeamsJwt(token, { appId, getSigningKey })).resolves.toBe(false);
  });

  it('rechaza un token con issuer incorrecto (no viene del Bot Framework)', async () => {
    const token = signToken({ issuer: 'https://issuer-falso.example.com' });
    await expect(verifyTeamsJwt(token, { appId, getSigningKey })).resolves.toBe(false);
  });

  it('rechaza un token expirado', async () => {
    const token = signToken({ expiresIn: -10 });
    await expect(verifyTeamsJwt(token, { appId, getSigningKey })).resolves.toBe(false);
  });

  it('rechaza un token firmado con una clave privada distinta (firma inválida)', async () => {
    const otherKeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const tampered = jwt.sign({}, otherKeyPair.privateKey, {
      algorithm: 'RS256',
      keyid: kid,
      issuer: BOT_FRAMEWORK_ISSUER,
      audience: appId,
      expiresIn: '5m',
    });
    await expect(verifyTeamsJwt(tampered, { appId, getSigningKey })).resolves.toBe(false);
  });

  it('rechaza si el "kid" del token no se puede resolver', async () => {
    const token = jwt.sign({}, privateKey, {
      algorithm: 'RS256',
      keyid: 'kid-inexistente',
      issuer: BOT_FRAMEWORK_ISSUER,
      audience: appId,
      expiresIn: '5m',
    });
    await expect(verifyTeamsJwt(token, { appId, getSigningKey })).resolves.toBe(false);
  });
});

describe('parseTeamsInbound', () => {
  it('extrae un mensaje de texto con la referencia de conversación completa', () => {
    const activity = {
      type: 'message',
      text: 'No puedo entrar a mi correo',
      from: { id: '29:abc', name: 'Juan Pérez', aadObjectId: 'aad-guid-1' },
      conversation: { id: 'conv-1' },
      serviceUrl: 'https://smba.trafficmanager.net/amer/',
    };

    expect(parseTeamsInbound(activity)).toEqual([
      {
        channel: 'TEAMS',
        externalUserId: 'aad-guid-1',
        externalConversationId: 'https://smba.trafficmanager.net/amer/::conv-1',
        senderDisplayName: 'Juan Pérez',
        text: 'No puedo entrar a mi correo',
      },
    ]);
  });

  it('usa el id de canal si no viene aadObjectId', () => {
    const activity = {
      type: 'message',
      text: 'hola',
      from: { id: '29:abc' },
      conversation: { id: 'conv-1' },
      serviceUrl: 'https://smba.trafficmanager.net/amer/',
    };
    expect(parseTeamsInbound(activity)[0].externalUserId).toBe('29:abc');
  });

  it('ignora actividades que no son mensajes (conversationUpdate, typing, etc.)', () => {
    expect(parseTeamsInbound({ type: 'conversationUpdate' })).toEqual([]);
    expect(parseTeamsInbound({ type: 'typing' })).toEqual([]);
  });

  it('no lanza con un body vacío o inesperado', () => {
    expect(parseTeamsInbound(null)).toEqual([]);
    expect(parseTeamsInbound({})).toEqual([]);
  });
});
