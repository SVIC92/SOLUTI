import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { CreateSupportGroupDto } from './dto/create-support-group.dto.js';

/** Grupos de soporte (ej. Redes, Hardware, Software) — usados para asignar tickets
 * por equipo en vez de por técnico individual, tanto manualmente como por las
 * reglas de automatización (plan `1.txt`, Fase 2). */
@Injectable()
export class SupportGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSupportGroupDto) {
    return this.prisma.supportGroup.create({ data: dto });
  }

  findAll() {
    return this.prisma.supportGroup.findMany({
      orderBy: { name: 'asc' },
      include: { members: { select: { id: true, fullName: true } } },
    });
  }
}
