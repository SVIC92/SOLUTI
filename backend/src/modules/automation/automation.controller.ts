import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '../../generated/prisma/enums.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { AutomationService } from './automation.service.js';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto.js';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto.js';

@ApiTags('automation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('automation-rules')
@Roles(RoleName.ADMIN)
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get()
  findAll() {
    return this.automationService.findAll();
  }

  @Post()
  create(@Body() dto: CreateAutomationRuleDto) {
    return this.automationService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAutomationRuleDto) {
    return this.automationService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.automationService.remove(id);
  }
}
