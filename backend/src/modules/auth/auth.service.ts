import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service.js';
import { ExternalIdentityService } from '../../common/external-identity/external-identity.service.js';
import { LdapClientService } from './ldap/ldap-client.service.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Autenticación LOCAL (email + password) y SSO por AD/LDAP (plan `1.txt`,
 * Portal Multi-canal/Integraciones). El modelo User ya contemplaba
 * authProvider/externalId para esto desde el diseño inicial — ver plan,
 * sección 4.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly ldapClient: LdapClientService,
    private readonly externalIdentity: ExternalIdentityService,
  ) {}

  async validateLocalUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    if (!user || user.authProvider !== 'LOCAL' || !user.passwordHash || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return user;
  }

  /**
   * SSO: valida contra el directorio AD/LDAP configurado (search-then-bind,
   * ver `LdapClientService`) y aprovisiona/reutiliza la cuenta local
   * correspondiente. Nunca se guarda la contraseña del directorio.
   */
  async validateLdapUser(username: string, password: string) {
    const ldapUser = await this.ldapClient.authenticate(username, password);

    const user = await this.externalIdentity.findOrCreate({
      provider: 'LDAP',
      externalId: ldapUser.uid,
      fullName: ldapUser.fullName,
      email: ldapUser.email,
    });

    if (!user.isActive) {
      throw new UnauthorizedException('Tu cuenta está desactivada. Contacta a un administrador.');
    }

    return user;
  }

  async issueTokens(user: {
    id: string;
    email: string;
    role: { name: string };
    groupId: string | null;
  }): Promise<AuthTokens> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role.name,
      groupId: user.groupId,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12);
  }
}
