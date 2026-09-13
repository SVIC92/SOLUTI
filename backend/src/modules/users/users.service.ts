import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { RoleName } from '../../generated/prisma/enums.js';
import { AuthService } from '../auth/auth.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';

// Nunca se serializa `passwordHash` (ni ningún otro campo sensible) hacia HTTP,
// incluso en endpoints restringidos a ADMIN — antes `include: { role: true }`
// devolvía el usuario completo, hash bcrypt incluido, en el body de la respuesta.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  isActive: true,
  authProvider: true,
  groupId: true,
  createdAt: true,
  updatedAt: true,
  role: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async create(dto: CreateUserDto) {
    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) {
      throw new NotFoundException(`Rol ${dto.role} no existe (¿se corrió el seed?)`);
    }

    const passwordHash = await this.authService.hashPassword(dto.password);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        roleId: role.id,
        groupId: dto.groupId,
      },
      select: SAFE_USER_SELECT,
    });
  }

  findAll(role?: RoleName) {
    return this.prisma.user.findMany({
      where: role ? { role: { name: role } } : undefined,
      select: SAFE_USER_SELECT,
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT });
    if (!user) {
      throw new NotFoundException(`Usuario ${id} no encontrado`);
    }
    return user;
  }

  /**
   * Usuario técnico especial que representa a la IA en el historial de auditoría
   * (plan `2.txt`, sección de Chatbot: "se modela como un usuario técnico
   * especial con authProvider = SERVICE"). Se usa como autor/actor de cualquier
   * acción que ai-service ejecute en nombre del sistema (auto-asignación de
   * tickets, borradores de la Base de Conocimiento, etc.). Se crea perezosamente
   * la primera vez que se necesita, sin depender de que el seed la haya corrido.
   */
  async findOrCreateAiServiceUser(): Promise<string> {
    const email = 'ai-agent@system.local';
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return existing.id;

    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: 'TECHNICIAN' } });
    const created = await this.prisma.user.create({
      data: { email, fullName: 'NovaBot IA', roleId: role.id, authProvider: 'SERVICE', isActive: true },
    });
    return created.id;
  }
}
