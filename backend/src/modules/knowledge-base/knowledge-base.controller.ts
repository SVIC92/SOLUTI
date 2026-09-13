import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { KnowledgeBaseService } from './knowledge-base.service.js';

@ApiTags('knowledge-base')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  // Cualquier usuario autenticado puede buscar/leer artículos publicados (self-service);
  // técnicos/admin además ven los borradores para poder terminarlos y publicarlos.
  private canSeeDrafts(user: AuthenticatedUser): boolean {
    return user.role === RoleName.ADMIN || user.role === RoleName.TECHNICIAN;
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.kbService.findAll({ search, categoryId, onlyPublished: !this.canSeeDrafts(user) });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const article = await this.kbService.findOne(id);
    if (!article.isPublished && !this.canSeeDrafts(user)) {
      throw new NotFoundException(`Artículo ${id} no encontrado`);
    }
    return article;
  }

  @Post()
  @Roles(RoleName.ADMIN, RoleName.TECHNICIAN)
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.kbService.create(dto, user.sub);
  }

  @Patch(':id')
  @Roles(RoleName.ADMIN, RoleName.TECHNICIAN)
  update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.kbService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.ADMIN)
  remove(@Param('id') id: string) {
    return this.kbService.remove(id);
  }
}
