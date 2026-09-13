import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MailerService } from './email/mailer.service.js';
import { NotificationsProcessor } from './email/notifications.processor.js';
import { NotificationsGateway } from './in-app/notifications.gateway.js';
import { TicketEventsListener } from './listeners/ticket-events.listener.js';
import { NotificationsController } from './notifications.controller.js';
import { EMAIL_QUEUE, NotificationsService } from './notifications.service.js';

@Module({
  imports: [
    JwtModule.register({}), // usado por NotificationsGateway para validar el token del socket
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    MailerService,
    NotificationsProcessor,
    TicketEventsListener,
  ],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
