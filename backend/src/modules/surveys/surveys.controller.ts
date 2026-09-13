import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SubmitSurveyResponseDto } from './dto/submit-survey-response.dto.js';
import { SurveysService } from './surveys.service.js';

@ApiTags('surveys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('surveys')
export class SurveysController {
  constructor(private readonly surveysService: SurveysService) {}

  @Get()
  @Roles(RoleName.ADMIN, RoleName.TECHNICIAN)
  findAll() {
    return this.surveysService.findAll();
  }

  @Get('stats')
  @Roles(RoleName.ADMIN, RoleName.TECHNICIAN)
  getStats() {
    return this.surveysService.getStats();
  }

  @Get('ticket/:ticketId')
  findByTicket(@Param('ticketId') ticketId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.surveysService.findByTicket(ticketId, user.sub, user.role);
  }

  @Post('ticket/:ticketId/respond')
  respond(
    @Param('ticketId') ticketId: string,
    @Body() dto: SubmitSurveyResponseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.surveysService.submitResponse(ticketId, dto, user.sub);
  }
}
