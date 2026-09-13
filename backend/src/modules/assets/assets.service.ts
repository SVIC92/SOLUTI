import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { CreateAssetDto } from './dto/create-asset.dto.js';
import type { UpdateAssetDto } from './dto/update-asset.dto.js';

/** Inventario de Activos de TI / CMDB (plan `1.txt`, Fase 2): vincula tickets a
 * equipos físicos o software concretos (ej. "vincular la falla a la Laptop DELL-042"). */
@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateAssetDto) {
    return this.prisma.asset.create({
      data: { ...dto, status: dto.status ?? 'activo' },
    });
  }

  findAll() {
    return this.prisma.asset.findMany({ orderBy: { assetTag: 'asc' } });
  }

  async findOne(id: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: { tickets: { orderBy: { createdAt: 'desc' } } },
    });
    if (!asset) {
      throw new NotFoundException(`Activo ${id} no encontrado`);
    }
    return asset;
  }

  update(id: string, dto: UpdateAssetDto) {
    return this.prisma.asset.update({ where: { id }, data: dto });
  }
}
