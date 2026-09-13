import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { UsersModule } from '../users/users.module.js';
import { AiClient } from './ai-client.js';
import { AiGatewayController } from './ai-gateway.controller.js';
import { AiInternalController } from './ai-internal.controller.js';
import { AiEventPublisher } from './event-publisher.js';

@Module({
  imports: [
    HttpModule.register({ timeout: 8_000 }),
    TicketsModule,
    UsersModule,
    NotificationsModule,
    KnowledgeBaseModule,
  ],
  controllers: [AiGatewayController, AiInternalController],
  providers: [AiClient, AiEventPublisher],
  exports: [AiClient],
})
export class AiGatewayModule {}
