import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName, TicketPriority } from '../../generated/prisma/enums.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { UpsertSlaPolicyDto } from './dto/upsert-sla-policy.dto.js';
import { SlaService } from './sla.service.js';

@ApiTags('sla')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sla-policies')
export class SlaController {
  constructor(private readonly slaService: SlaService) {}

  @Get()
  findAll() {
    return this.slaService.findAll();
  }

  @Get(':priority')
  findOne(@Param('priority') priority: TicketPriority) {
    return this.slaService.getPolicyFor(priority);
  }

  @Post()
  @Roles(RoleName.ADMIN)
  upsert(@Body() dto: UpsertSlaPolicyDto) {
    return this.slaService.upsert(dto);
  }
}
