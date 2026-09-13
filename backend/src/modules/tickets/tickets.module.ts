import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module.js';
import { SlaModule } from '../sla/sla.module.js';
import { UsersModule } from '../users/users.module.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

@Module({
  imports: [SlaModule, AutomationModule, UsersModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
