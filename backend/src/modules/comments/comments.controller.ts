import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';

// Montado bajo /tickets/:ticketId/comments — ver TicketsModule.
// El scoping (dueño del ticket o staff) y el filtrado de notas internas lo
// hace CommentsService a partir del usuario autenticado, no este controller.
@ApiTags('comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tickets/:ticketId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  create(
    @Param('ticketId') ticketId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.commentsService.create(ticketId, dto, user);
  }

  @Get()
  findForTicket(@Param('ticketId') ticketId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.commentsService.findForTicket(ticketId, user);
  }
}
