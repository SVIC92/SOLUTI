import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

/**
 * `validateLdapUser` es pura orquestación (LdapClientService → aprovisionar
 * cuenta local → validar isActive) — se prueba con dobles de sus dos
 * dependencias, sin Prisma ni una conexión LDAP real.
 */
describe('AuthService.validateLdapUser', () => {
  function buildService(overrides: {
    authenticate?: ReturnType<typeof vi.fn>;
    findOrCreate?: ReturnType<typeof vi.fn>;
  }) {
    const ldapClient = { authenticate: overrides.authenticate ?? vi.fn() };
    const externalIdentity = { findOrCreate: overrides.findOrCreate ?? vi.fn() };
    const service = new AuthService(
      null as never,
      null as never,
      null as never,
      ldapClient as never,
      externalIdentity as never,
    );
    return { service, ldapClient, externalIdentity };
  }

  it('aprovisiona/reutiliza la cuenta local con los datos que devuelve el directorio', async () => {
    const authenticate = vi.fn().mockResolvedValue({
      dn: 'CN=Juan Perez,DC=empresa,DC=local',
      uid: 'jperez',
      email: 'jperez@empresa.local',
      fullName: 'Juan Pérez',
    });
    const findOrCreate = vi.fn().mockResolvedValue({
      id: 'user-1',
      isActive: true,
      role: { name: 'FINAL_USER' },
    });
    const { service } = buildService({ authenticate, findOrCreate });

    const user = await service.validateLdapUser('jperez', 'correcta');

    expect(authenticate).toHaveBeenCalledWith('jperez', 'correcta');
    expect(findOrCreate).toHaveBeenCalledWith({
      provider: 'LDAP',
      externalId: 'jperez',
      fullName: 'Juan Pérez',
      email: 'jperez@empresa.local',
    });
    expect(user.id).toBe('user-1');
  });

  it('rechaza si la cuenta local ya existía pero fue desactivada por un admin', async () => {
    const authenticate = vi.fn().mockResolvedValue({
      dn: 'CN=Juan Perez,DC=empresa,DC=local',
      uid: 'jperez',
      email: 'jperez@empresa.local',
      fullName: 'Juan Pérez',
    });
    const findOrCreate = vi.fn().mockResolvedValue({ id: 'user-1', isActive: false, role: { name: 'FINAL_USER' } });
    const { service } = buildService({ authenticate, findOrCreate });

    await expect(service.validateLdapUser('jperez', 'correcta')).rejects.toThrow(UnauthorizedException);
  });

  it('propaga el rechazo del directorio (credenciales inválidas) sin aprovisionar nada', async () => {
    const authenticate = vi.fn().mockRejectedValue(new UnauthorizedException('Credenciales inválidas'));
    const findOrCreate = vi.fn();
    const { service } = buildService({ authenticate, findOrCreate });

    await expect(service.validateLdapUser('jperez', 'incorrecta')).rejects.toThrow(UnauthorizedException);
    expect(findOrCreate).not.toHaveBeenCalled();
  });
});
