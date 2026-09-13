import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SlaCheckerJob } from '../../jobs/sla-checker.job.js';
import { SlaController } from './sla.controller.js';
import { SlaService } from './sla.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [SlaController],
  providers: [SlaService, SlaCheckerJob],
  exports: [SlaService],
})
export class SlaModule {}
