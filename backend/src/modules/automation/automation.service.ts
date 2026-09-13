import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { CreateAutomationRuleDto } from './dto/create-automation-rule.dto.js';
import type { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto.js';

export interface AutoAssignment {
  assignedToId?: string;
  assignedGroupId?: string;
}

/**
 * Automatización y Reglas de Enrutamiento (plan `1.txt`, Fase 2): asigna
 * automáticamente un ticket nuevo a un técnico o grupo de soporte según su
 * categoría (ej. todo lo de "Redes" se asigna al especialista en redes).
 * `TicketsService.create()` consulta `findActiveRuleFor` al crear cada ticket.
 */
@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.automationRule.findMany({
      include: { category: true, assignToGroup: true },
      orderBy: { categoryId: 'asc' },
    });
  }

  async create(dto: CreateAutomationRuleDto) {
    // Solo una regla activa por categoría, para evitar asignaciones ambiguas.
    if (dto.isActive !== false) {
      await this.prisma.automationRule.updateMany({
        where: { categoryId: dto.categoryId, isActive: true },
        data: { isActive: false },
      });
    }

    return this.prisma.automationRule.create({
      data: {
        categoryId: dto.categoryId,
        assignToGroupId: dto.assignToGroupId,
        assignToUserId: dto.assignToUserId,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateAutomationRuleDto) {
    if (dto.isActive) {
      const rule = await this.prisma.automationRule.findUniqueOrThrow({ where: { id } });
      await this.prisma.automationRule.updateMany({
        where: { categoryId: rule.categoryId, isActive: true, id: { not: id } },
        data: { isActive: false },
      });
    }

    return this.prisma.automationRule.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.automationRule.delete({ where: { id } });
  }

  /** Regla activa vigente para una categoría, o null si no hay ninguna configurada. */
  async findActiveRuleFor(categoryId: string): Promise<AutoAssignment | null> {
    const rule = await this.prisma.automationRule.findFirst({
      where: { categoryId, isActive: true },
    });
    if (!rule) return null;

    return {
      assignedToId: rule.assignToUserId ?? undefined,
      assignedGroupId: rule.assignToGroupId ?? undefined,
    };
  }
}
