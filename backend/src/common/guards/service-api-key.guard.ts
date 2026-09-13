import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

/**
 * Autenticación de servicio a servicio (no de usuario): protege los endpoints
 * `internal/ai/*` que llama `services/ai-service` para escribir de vuelta los
 * metadatos de IA en un ticket (ver plan `2.txt`, puntos de extensión). Usa el
 * mismo secreto compartido (`AI_SERVICE_API_KEY`) que el core usa para llamar a
 * ai-service en sentido contrario (ver AiClient).
 */
@Injectable()
export class ServiceApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey: unknown = request.headers['x-api-key'];
    const expected = this.config.get<string>('AI_SERVICE_API_KEY') ?? '';

    if (typeof apiKey !== 'string' || !this.matches(apiKey, expected)) {
      throw new UnauthorizedException('API key de servicio inválida');
    }
    return true;
  }

  // Comparación en tiempo constante: evita filtrar por temporización cuántos
  // caracteres iniciales del secreto acertó un atacante.
  private matches(provided: string, expected: string): boolean {
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected);
    if (providedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(providedBuf, expectedBuf);
  }
}
