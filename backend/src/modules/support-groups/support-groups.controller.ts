import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '../../generated/prisma/enums.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CreateSupportGroupDto } from './dto/create-support-group.dto.js';
import { SupportGroupsService } from './support-groups.service.js';

@ApiTags('support-groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('support-groups')
export class SupportGroupsController {
  constructor(private readonly supportGroupsService: SupportGroupsService) {}

  @Get()
  findAll() {
    return this.supportGroupsService.findAll();
  }

  @Post()
  @Roles(RoleName.ADMIN)
  create(@Body() dto: CreateSupportGroupDto) {
    return this.supportGroupsService.create(dto);
  }
}
