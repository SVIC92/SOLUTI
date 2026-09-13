import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

/** Métricas básicas del MVP (plan, sección 1): tickets abiertos, tiempo medio de
 * primera respuesta, y tickets cerrados por técnico. */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const [openCount, closedByTechnician, responseTimes] = await Promise.all([
      this.prisma.ticket.count({ where: { status: { in: ['NEW', 'IN_PROGRESS', 'ON_HOLD'] } } }),
      this.prisma.ticket.groupBy({
        by: ['assignedToId'],
        where: { status: 'CLOSED', assignedToId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.ticket.findMany({
        where: { firstResponseAt: { not: null } },
        select: { createdAt: true, firstResponseAt: true },
      }),
    ]);

    const avgFirstResponseMinutes =
      responseTimes.length === 0
        ? null
        : responseTimes.reduce(
            (sum, t) => sum + (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 60_000,
            0,
          ) / responseTimes.length;

    return {
      openTickets: openCount,
      avgFirstResponseMinutes,
      closedByTechnician: closedByTechnician.map((row) => ({
        technicianId: row.assignedToId,
        closedCount: row._count._all,
      })),
    };
  }
}
