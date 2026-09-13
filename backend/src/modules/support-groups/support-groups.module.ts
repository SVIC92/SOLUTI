import { Module } from '@nestjs/common';
import { SupportGroupsController } from './support-groups.controller.js';
import { SupportGroupsService } from './support-groups.service.js';

@Module({
  controllers: [SupportGroupsController],
  providers: [SupportGroupsService],
  exports: [SupportGroupsService],
})
export class SupportGroupsModule {}
