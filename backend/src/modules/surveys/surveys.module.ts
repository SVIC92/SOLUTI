import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SurveyEventsListener } from './listeners/survey-events.listener.js';
import { SurveysController } from './surveys.controller.js';
import { SurveysService } from './surveys.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [SurveysController],
  providers: [SurveysService, SurveyEventsListener],
  exports: [SurveysService],
})
export class SurveysModule {}
