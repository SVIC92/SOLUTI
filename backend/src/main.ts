import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // `rawBody: true` expone `req.rawBody` (Buffer) además del body ya parseado
  // — lo necesitan los webhooks del Portal Multi-canal (`modules/channels`)
  // para verificar firmas HMAC/JWT, que se calculan sobre los bytes exactos
  // recibidos y no sobre una re-serialización de `req.body`.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.enableCors({ origin: config.get<string>('FRONTEND_URL'), credentials: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Help Desk API')
    .setDescription('API del núcleo del Sistema de Gestión de Solicitudes de Soporte TI')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(config.get<number>('PORT', 3000));
}

bootstrap();
