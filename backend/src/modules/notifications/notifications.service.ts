import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationsGateway } from './in-app/notifications.gateway.js';

export const EMAIL_QUEUE = 'notifications-email';

export interface NotifyInput {
  userId: string;
  ticketId?: string;
  title: string;
  body: string;
  sendEmail?: boolean;
}

/**
 * Punto único para notificar a un usuario: persiste la notificación in-app,
 * la empuja por WebSocket, y (opcionalmente) encola el envío de email vía BullMQ
 * — así un fallo temporal de SMTP no bloquea la respuesta HTTP ni se pierde
 * (reintentos configurados en el processor).
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        ticketId: input.ticketId,
        channel: 'IN_APP',
        title: input.title,
        body: input.body,
      },
    });

    this.gateway.emitToUser(input.userId, 'notification.new', notification);

    if (input.sendEmail) {
      await this.emailQueue.add(
        'send-email',
        { userId: input.userId, title: input.title, body: input.body },
        { attempts: 5, backoff: { type: 'exponential', delay: 5_000 } },
      );
    }
  }

  markAsRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  findForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
