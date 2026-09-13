import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { validationSchema } from './config/validation.schema.js';
import { PrismaModule } from './database/prisma.module.js';
import { AiGatewayModule } from './modules/ai-gateway/ai-gateway.module.js';
import { AssetsModule } from './modules/assets/assets.module.js';
import { AutomationModule } from './modules/automation/automation.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { ChannelsModule } from './modules/channels/channels.module.js';
import { CommentsModule } from './modules/comments/comments.module.js';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SlaModule } from './modules/sla/sla.module.js';
import { SupportGroupsModule } from './modules/support-groups/support-groups.module.js';
import { SurveysModule } from './modules/surveys/surveys.module.js';
import { TicketsModule } from './modules/tickets/tickets.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema }),
    EventEmitterModule.forRoot(), // bus de eventos de dominio en proceso (ver common/events)
    ScheduleModule.forRoot(), // usado por los cron jobs de SLA/encuestas (Fase 2)
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('REDIS_URL') },
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    SlaModule,
    AssetsModule,
    KnowledgeBaseModule,
    SupportGroupsModule,
    AutomationModule,
    TicketsModule,
    CommentsModule,
    NotificationsModule,
    SurveysModule,
    ReportsModule,
    AiGatewayModule,
    ChannelsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
