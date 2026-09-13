import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '../../generated/prisma/enums.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AiClient } from './ai-client.js';
import { CopilotDraftDto } from './dto/copilot-draft.dto.js';
import { CopilotSearchDto } from './dto/copilot-search.dto.js';
import { SendChatbotMessageDto } from './dto/send-chatbot-message.dto.js';

interface AnomalyClusterRow {
  id: string;
  clusterLabel: string;
  severity: string;
  status: string;
  detectedAt: Date;
  tickets: { id: string; code: string }[];
}

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiGatewayController {
  constructor(
    private readonly aiClient: AiClient,
    private readonly prisma: PrismaService,
  ) {}

  @Post('chatbot/message')
  sendChatbotMessage(@Body() body: SendChatbotMessageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.aiClient.sendChatbotMessage({ ...body, userId: user.sub, channel: 'web' });
  }

  // El Copilot es una herramienta para el equipo de soporte, no para el
  // usuario final — antes cualquier autenticado podía invocar `copilot/draft`
  // con cualquier `ticketId` ajeno y generar un borrador de respuesta.
  @Post('copilot/search')
  @Roles(RoleName.ADMIN, RoleName.TECHNICIAN)
  searchSimilarTickets(@Body() body: CopilotSearchDto) {
    return this.aiClient.searchSimilarTickets(body.query, body.categoryId);
  }

  @Post('copilot/draft')
  @Roles(RoleName.ADMIN, RoleName.TECHNICIAN)
  draftResponse(@Body() body: CopilotDraftDto) {
    return this.aiClient.draftResponse(body.ticketId, body.technicianNotes);
  }

  // Detección de Anomalías (plan `2.txt`, módulo 4): `ai_anomaly_clusters` es
  // propiedad de services/ai-service (Alembic, no Prisma) — el core solo la lee,
  // vía consulta raw, tal como especifica el plan para las tablas `ai_*`.
  @Get('anomaly-clusters')
  @Roles(RoleName.ADMIN, RoleName.TECHNICIAN)
  getAnomalyClusters() {
    return this.prisma.$queryRaw<AnomalyClusterRow[]>`
      SELECT
        c.id,
        c.cluster_label AS "clusterLabel",
        c.severity,
        c.status,
        c.detected_at AS "detectedAt",
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'code', t.code))
           FROM tickets t WHERE t.id = ANY(c.ticket_ids)),
          '[]'::jsonb
        ) AS "tickets"
      FROM ai_anomaly_clusters c
      ORDER BY c.detected_at DESC
      LIMIT 50
    `;
  }
}
