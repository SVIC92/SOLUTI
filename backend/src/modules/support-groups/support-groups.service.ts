import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { CreateSupportGroupDto } from './dto/create-support-group.dto.js';
import type { UpdateSupportGroupDto } from './dto/update-support-group.dto.js';

/** Grupos de soporte (ej. Redes, Hardware, Software) — usados para asignar tickets
 * por equipo en vez de por técnico individual, tanto manualmente como por las
 * reglas de automatización (plan `1.txt`, Fase 2). */
@Injectable()
export class SupportGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSupportGroupDto) {
    try {
      return await this.prisma.supportGroup.create({ data: dto });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(`Ya existe un grupo de soporte llamado "${dto.name}"`);
      }
      throw error;
    }
  }

  findAll() {
    return this.prisma.supportGroup.findMany({
      orderBy: { name: 'asc' },
      include: { members: { select: { id: true, fullName: true } } },
    });
  }

  async update(id: string, dto: UpdateSupportGroupDto) {
    await this.findOneOrThrow(id);
    try {
      return await this.prisma.supportGroup.update({ where: { id }, data: dto });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(`Ya existe un grupo de soporte llamado "${dto.name}"`);
      }
      throw error;
    }
  }

  /** No se permite eliminar un grupo con usuarios asignados: la relación
   * `User.groupId` es opcional, así que Prisma lo pondría en null en silencio
   * y dejaría a esos técnicos/usuarios sin grupo sin que el admin se dé cuenta. */
  async remove(id: string) {
    const group = await this.findOneOrThrow(id);
    if (group.members.length > 0) {
      throw new ConflictException(
        `No se puede eliminar "${group.name}": tiene ${group.members.length} usuario(s) asignado(s). Reasígnalos primero.`,
      );
    }
    await this.prisma.supportGroup.delete({ where: { id } });
    return { success: true };
  }

  private async findOneOrThrow(id: string) {
    const group = await this.prisma.supportGroup.findUnique({
      where: { id },
      include: { members: { select: { id: true } } },
    });
    if (!group) {
      throw new NotFoundException(`Grupo de soporte ${id} no encontrado`);
    }
    return group;
  }
}
