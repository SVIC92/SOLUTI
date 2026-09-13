import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LdapLoginDto } from './dto/ldap-login.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { LdapClientService } from './ldap/ldap-client.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly ldapClient: LdapClientService,
  ) {}

  // El `ThrottlerModule.forRoot(...)` de AuthModule quedaba registrado pero sin
  // ningún guard que lo aplicara — /auth/login no tenía en realidad mitigación
  // de fuerza bruta pese al comentario que lo afirmaba. Se aplica aquí a ambos
  // endpoints de login (local y LDAP), que es donde importa.
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateLocalUser(dto.email, dto.password);
    return this.authService.issueTokens(user);
  }

  /** El frontend usa esto para decidir si mostrar el botón de "Inicio de sesión
   * corporativo (SSO)" — no todo despliegue on-premise tiene AD/LDAP configurado. */
  @Get('login/ldap/status')
  ldapStatus() {
    return { enabled: this.ldapClient.isConfigured };
  }

  @UseGuards(ThrottlerGuard)
  @Post('login/ldap')
  @HttpCode(HttpStatus.OK)
  async loginLdap(@Body() dto: LdapLoginDto) {
    const user = await this.authService.validateLdapUser(dto.username, dto.password);
    return this.authService.issueTokens(user);
  }
}
