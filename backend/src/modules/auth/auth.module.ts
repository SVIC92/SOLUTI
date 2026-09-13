import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { ExternalIdentityModule } from '../../common/external-identity/external-identity.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LdapClientService } from './ldap/ldap-client.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

/**
 * Global: `JwtAuthGuard` (AuthGuard('jwt') de @nestjs/passport) inyecta
 * `AuthModuleOptions` en su constructor — solo la provee `PassportModule.register()`.
 * Sin `@Global()` + re-exportar `PassportModule` aquí, cada uno de los ~14 módulos
 * que usa `JwtAuthGuard` tendría que importar AuthModule por su cuenta.
 */
@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // secretos se pasan por llamada (access vs refresh), ver AuthService
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]), // mitiga fuerza bruta sobre /auth/login
    ExternalIdentityModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LdapClientService],
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
