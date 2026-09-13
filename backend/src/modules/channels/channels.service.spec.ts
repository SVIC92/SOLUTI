import { describe, expect, it, vi } from 'vitest';
import { ChannelsService } from './channels.service.js';

/**
 * `handleInboundMessage` es pura orquestación (aprovisionar usuario → resolver
 * categoría por defecto → crear ticket) — se prueba con dobles de Prisma,
 * `ExternalIdentityService` y `TicketsService`, sin base de datos real.
 */
describe('ChannelsService.handleInboundMessage', () => {
  function buildService() {
    const prisma = { category: { upsert: vi.fn().mockResolvedValue({ id: 'cat-1', name: 'Multicanal (Sin Clasificar)' }) } };
    const externalIdentity = { findOrCreate: vi.fn().mockResolvedValue({ id: 'user-1' }) };
    const ticketsService = { create: vi.fn().mockResolvedValue({ id: 'ticket-1', code: 'TCK-000123' }) };

    const service = new ChannelsService(
      prisma as never,
      externalIdentity as never,
      ticketsService as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, externalIdentity, ticketsService };
  }

  it('aprovisiona la cuenta sombra, resuelve la categoría por defecto y crea el ticket', async () => {
    const { service, externalIdentity, ticketsService } = buildService();

    const result = await service.handleInboundMessage({
      channel: 'WHATSAPP',
      externalUserId: '51999999999',
      externalConversationId: '51999999999',
      senderDisplayName: 'Juan Pérez',
      text: 'No puedo entrar a la VPN de la empresa',
    });

    expect(externalIdentity.findOrCreate).toHaveBeenCalledWith({
      provider: 'WHATSAPP',
      externalId: '51999999999',
      fullName: 'Juan Pérez',
      email: undefined,
    });
    expect(ticketsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'No puedo entrar a la VPN de la empresa',
        categoryId: 'cat-1',
      }),
      'user-1',
    );
    expect(result).toEqual({ ticketCode: 'TCK-000123' });
  });

  it('la descripción siempre supera el mínimo de 10 caracteres aunque el mensaje sea muy corto', async () => {
    const { service, ticketsService } = buildService();

    await service.handleInboundMessage({
      channel: 'SLACK',
      externalUserId: 'U1',
      externalConversationId: 'C1',
      senderDisplayName: 'Ana',
      text: 'hola',
    });

    const [dto] = ticketsService.create.mock.calls[0];
    expect(dto.description.length).toBeGreaterThanOrEqual(10);
    expect(dto.title.length).toBeGreaterThanOrEqual(3);
  });

  it('usa un título genérico si el mensaje es demasiado corto para servir de título', async () => {
    const { service, ticketsService } = buildService();

    await service.handleInboundMessage({
      channel: 'TEAMS',
      externalUserId: 'aad-1',
      externalConversationId: 'svc::conv-1',
      senderDisplayName: 'Ana',
      text: 'hi',
    });

    const [dto] = ticketsService.create.mock.calls[0];
    expect(dto.title).toBe('Solicitud recibida por canal externo');
  });

  it('trunca títulos demasiado largos', async () => {
    const { service, ticketsService } = buildService();
    const longText = 'a'.repeat(200);

    await service.handleInboundMessage({
      channel: 'WHATSAPP',
      externalUserId: '51999999999',
      externalConversationId: '51999999999',
      senderDisplayName: 'Juan',
      text: longText,
    });

    const [dto] = ticketsService.create.mock.calls[0];
    expect(dto.title.length).toBeLessThanOrEqual(80);
    expect(dto.title.endsWith('...')).toBe(true);
  });
});
