import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { CreateArticleDto } from './dto/create-article.dto.js';
import type { UpdateArticleDto } from './dto/update-article.dto.js';

export interface FindArticlesFilters {
  search?: string;
  categoryId?: string;
  onlyPublished: boolean; // false solo para ADMIN/TECHNICIAN (ven también borradores)
}

/**
 * Base de Conocimiento / FAQ — Self-Service (plan `1.txt`, Fase 2): permite a los
 * usuarios resolver problemas comunes por sí mismos antes de abrir un ticket,
 * reduciendo la carga del equipo de TI. `articleDraftGeneratedByAi` queda reservado
 * para cuando el generador automático de documentación (Fase de IA) cree borradores
 * a partir de tickets resueltos — siempre con revisión humana antes de publicar.
 */
@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateArticleDto, authorId: string) {
    return this.prisma.knowledgeArticle.create({
      data: { ...dto, authorId },
    });
  }

  /**
   * Generación Automática de Documentación (plan `2.txt`, módulo 6): crea un
   * artículo-borrador a partir de un ticket resuelto. Nunca se autopublica
   * (`isPublished: false`) — un ADMIN/TECHNICIAN debe revisarlo y publicarlo
   * desde la Base de Conocimiento, igual que cualquier otro borrador. También
   * deja constancia en `ai_kb_drafts` (tabla propia de ai-service) para
   * trazabilidad de qué ticket originó cada borrador.
   */
  async createAiDraft(params: {
    sourceTicketId: string;
    title: string;
    content: string;
    categoryId?: string;
    authorId: string;
  }) {
    const article = await this.prisma.knowledgeArticle.create({
      data: {
        title: params.title,
        content: params.content,
        categoryId: params.categoryId,
        authorId: params.authorId,
        isPublished: false,
        articleDraftGeneratedByAi: true,
      },
    });

    await this.prisma.$executeRaw`
      INSERT INTO ai_kb_drafts (source_ticket_id, draft_title, draft_body, status)
      VALUES (${params.sourceTicketId}::uuid, ${params.title}, ${params.content}, 'pending_review')
    `;

    return article;
  }

  findAll(filters: FindArticlesFilters) {
    return this.prisma.knowledgeArticle.findMany({
      where: {
        isPublished: filters.onlyPublished ? true : undefined,
        categoryId: filters.categoryId,
        ...(filters.search && {
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { content: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: { category: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const article = await this.prisma.knowledgeArticle.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!article) {
      throw new NotFoundException(`Artículo ${id} no encontrado`);
    }
    return article;
  }

  update(id: string, dto: UpdateArticleDto) {
    return this.prisma.knowledgeArticle.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.knowledgeArticle.delete({ where: { id } });
  }
}
