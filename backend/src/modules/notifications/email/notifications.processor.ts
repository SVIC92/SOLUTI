import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../../../database/prisma.service.js';
import { EMAIL_QUEUE } from '../notifications.service.js';
import { MailerService } from './mailer.service.js';

interface EmailJobData {
  userId: string;
  title: string;
  body: string;
}

/** Consume la cola `notifications-email` (BullMQ + Redis) con reintentos automáticos. */
@Processor(EMAIL_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    const { userId, title, body } = job.data;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return; // usuario eliminado entre el encolado y el procesamiento

    await this.mailer.send(user.email, title, `<p>${body}</p>`);
  }
}
