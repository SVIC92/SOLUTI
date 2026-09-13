import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Envío de email vía SMTP configurable por entorno (para uso interno, puede ser
 * un relay SMTP corporativo). Las plantillas concretas (ticket-created.hbs, etc.)
 * se compilan en notifications.processor.ts al consumir la cola.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('SMTP_FROM', 'helpdesk@empresa.local'),
        to,
        subject,
        html,
      });
    } catch (error) {
      // No relanzamos: BullMQ ya gestiona reintentos a nivel de job; un fallo aquí
      // no debe tumbar el worker completo.
      this.logger.error(`Fallo enviando email a ${to}: ${(error as Error).message}`);
      throw error;
    }
  }
}
