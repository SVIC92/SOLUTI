import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Wrapper de NestJS sobre el PrismaClient generado, con ciclo de vida gestionado
 * por el contenedor de DI (conecta al iniciar el módulo, desconecta al destruirlo).
 *
 * Prisma 7 (generador `prisma-client`) ya no acepta conexión implícita por
 * DATABASE_URL: exige un driver adapter explícito.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
