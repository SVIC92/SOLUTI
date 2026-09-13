import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthProvider } from '../../generated/prisma/enums.js';

/**
 * Resuelve (o crea perezosamente) la cuenta local que representa una
 * identidad externa: un usuario de AD/LDAP que inicia sesión por SSO
 * (`modules/auth/ldap`), o un contacto de WhatsApp/Slack/Teams que escribe por
 * primera vez (`modules/channels`) — plan `1.txt`, "Portal Multi-canal /
 * Integraciones". Vive en `common/` (no en `modules/users`) precisamente para
 * que tanto `AuthModule` como `ChannelsModule` puedan usarla sin depender de
 * `UsersModule` (que a su vez depende de `AuthModule` — evita un ciclo).
 *
 * Estas cuentas nunca tienen `passwordHash` ni pueden hacer login local: se
 * identifican de forma estable por `(authProvider, externalId)`, nunca por
 * email (que aquí es sintético cuando el canal no entrega uno real).
 */
@Injectable()
export class ExternalIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(params: {
    provider: Exclude<AuthProvider, 'LOCAL' | 'SERVICE'>;
    externalId: string;
    fullName: string;
    email?: string;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { authProvider_externalId: { authProvider: params.provider, externalId: params.externalId } },
      include: { role: true },
    });
    if (existing) return existing;

    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: 'FINAL_USER' } });
    const email = params.email ?? `${params.provider.toLowerCase()}:${params.externalId}@channel.local`;

    return this.prisma.user.create({
      data: {
        email,
        fullName: params.fullName || email,
        roleId: role.id,
        authProvider: params.provider,
        externalId: params.externalId,
      },
      include: { role: true },
    });
  }
}
