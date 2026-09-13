import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Valida el JWT (Authorization: Bearer <token>) vía la JwtStrategy de Passport. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
