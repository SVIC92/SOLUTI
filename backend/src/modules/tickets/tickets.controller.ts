import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '../../generated/prisma/enums.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { AssignTicketDto } from './dto/assign-ticket.dto.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { LinkAssetDto } from './dto/link-asset.dto.js';
import { UpdateTicketDto } from './dto/update-ticket.dto.js';
import { TicketsService } from './tickets.service.js';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.create(dto, user.sub);
  }

  // Sin @Roles: cualquier usuario autenticado puede listar tickets, pero el
  // servicio fuerza el scoping (un FINAL_USER solo ve los suyos, ver
  // TicketsService.findAll) — antes esto no se aplicaba y exponía todos los
  // tickets de la organización a cualquier usuario final.
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assignedTo') assignedToId?: string,
  ) {
    return this.ticketsService.findAll({ status, priority, assignedToId }, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.findOne(id, user);
  }

  // Cambiar estado/prioridad es una acción de gestión — antes no tenía ningún
  // @Roles y cualquier FINAL_USER autenticado podía cerrar/resolver el ticket
  // de otra persona con solo conocer su ID.
  @Patch(':id')
  @Roles(RoleName.ADMIN, RoleName.TECHNICIAN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.update(id, dto, user.sub);
  }

  @Post(':id/assign')
  @Roles(RoleName.ADMIN, RoleName.TECHNICIAN)
  assign(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.assign(id, dto, user.sub);
  }

  @Post(':id/link-asset')
  @Roles(RoleName.ADMIN, RoleName.TECHNICIAN)
  linkAsset(
    @Param('id') id: string,
    @Body() dto: LinkAssetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.linkAsset(id, dto.assetId, user.sub);
  }

  @Get(':id/sla-status')
  getSlaStatus(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.getSlaStatus(id, user);
  }
}
