import { Module } from '@nestjs/common';
import { ExternalIdentityModule } from '../../common/external-identity/external-identity.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { SlackAdapter } from './adapters/slack.adapter.js';
import { TeamsAdapter } from './adapters/teams.adapter.js';
import { WhatsappAdapter } from './adapters/whatsapp.adapter.js';
import { ChannelsController } from './channels.controller.js';
import { ChannelsService } from './channels.service.js';

@Module({
  imports: [ExternalIdentityModule, TicketsModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, WhatsappAdapter, SlackAdapter, TeamsAdapter],
})
export class ChannelsModule {}
