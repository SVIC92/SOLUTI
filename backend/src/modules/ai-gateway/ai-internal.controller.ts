import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceApiKeyGuard } from '../../common/guards/service-api-key.guard.js';
import { CreateAiKbDraftDto } from '../knowledge-base/dto/create-ai-kb-draft.dto.js';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateTicketViaServiceDto } from '../tickets/dto/create-ticket-via-service.dto.js';
import { UpdateAiMetadataDto } from '../tickets/dto/update-ai-metadata.dto.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { UsersService } from '../users/users.service.js';
import { AnomalyAlertDto } from './dto/anomaly-alert.dto.js';

/**
 * Endpoints internos llamados por `services/ai-service` (nunca por el frontend):
 * autenticados con la API key de servicio, no con JWT de usuario. Ver plan `2.txt`,
 * "puntos de extensión de IA" — este es el `POST /internal/ai/tickets/:id/classification`
 * que allí se describe.
 */
@ApiTags('internal-ai')
@UseGuards(ServiceApiKeyGuard)
@Controller('internal/ai')
export class AiInternalController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Patch('tickets/:id/classification')
  updateClassification(@Param('id') id: string, @Body() dto: UpdateAiMetadataDto) {
    return this.ticketsService.updateAiMetadata(id, dto);
  }

  // Usado por el Chatbot Nivel 1 (plan `2.txt`, módulo 2) cuando escala una
  // solicitud que no puede resolver de forma autónoma: crea un ticket real en
  // nombre del usuario, reutilizando toda la lógica de negocio del core (SLA,
  // enrutamiento por categoría, notificaciones) en vez de insertar directo en BD.
  @Post('tickets')
  createTicket(@Body() dto: CreateTicketViaServiceDto) {
    return this.ticketsService.create(dto, dto.createdById);
  }

  // Detección de Anomalías (plan `2.txt`, módulo 4): notifica a todo el equipo
  // ADMIN cuando ai-service detecta un clúster de tickets similares en poco
  // tiempo (posible caída general). Pasa por NotificationsService para que
  // también llegue por WebSocket en tiempo real, no solo insertado en BD.
  @Post('anomaly-alert')
  async anomalyAlert(@Body() dto: AnomalyAlertDto) {
    const admins = await this.usersService.findAll('ADMIN');
    const body = `${dto.clusterLabel}: ${dto.ticketCodes.join(', ')}`;

    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.notify({
          userId: admin.id,
          title: dto.severity === 'critical' ? '🔴 Posible incidencia masiva' : '⚠️ Clúster de tickets similares',
          body,
          sendEmail: dto.severity === 'critical',
        }),
      ),
    );

    return { notified: admins.length };
  }

  // Generación Automática de Documentación (plan `2.txt`, módulo 6): crea un
  // artículo-borrador (nunca publicado automáticamente) a partir de un ticket
  // resuelto. El autor queda registrado como el usuario técnico especial de IA
  // para dejar claro en la Base de Conocimiento que requiere revisión humana.
  @Post('knowledge-articles')
  async createKbDraft(@Body() dto: CreateAiKbDraftDto) {
    const authorId = await this.usersService.findOrCreateAiServiceUser();
    return this.knowledgeBaseService.createAiDraft({
      sourceTicketId: dto.sourceTicketId,
      title: dto.title,
      content: dto.content,
      categoryId: dto.categoryId,
      authorId,
    });
  }
}
