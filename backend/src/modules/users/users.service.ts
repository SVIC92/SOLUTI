import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { RoleName } from '../../generated/prisma/enums.js';
import { AuthService } from '../auth/auth.service.js';
import type { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

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

    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          roleId: role.id,
          groupId: dto.groupId,
        },
        select: SAFE_USER_SELECT,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(`Ya existe un usuario con el correo ${dto.email}`);
      }
      throw error;
    }
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

  /** Autoservicio de perfil (PATCH /users/me): por ahora solo el nombre es editable. */
  async updateProfile(id: string, dto: UpdateProfileDto) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
      },
      select: SAFE_USER_SELECT,
    });
  }

  /** Edición por un ADMIN de OTRO usuario (PATCH /users/:id): a diferencia de
   * updateProfile (autoservicio), aquí también se puede reasignar rol/grupo y
   * activar/desactivar la cuenta. No permite tocar email ni contraseña — el
   * cambio de contraseña sigue siendo autoservicio (POST /users/me/change-password). */
  async adminUpdate(id: string, dto: AdminUpdateUserDto) {
    await this.findOne(id);

    let roleId: number | undefined;
    if (dto.role !== undefined) {
      const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
      if (!role) {
        throw new NotFoundException(`Rol ${dto.role} no existe (¿se corrió el seed?)`);
      }
      roleId = role.id;
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.groupId !== undefined && { groupId: dto.groupId }),
        ...(roleId !== undefined && { roleId }),
      },
      select: SAFE_USER_SELECT,
    });
  }

  /** Cambio de contraseña autoservicio (POST /users/me/change-password). Solo aplica
   * a cuentas LOCAL: las cuentas LDAP/AD/SSO no tienen contraseña gestionada aquí. */
  async changePassword(id: string, dto: ChangePasswordDto): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario ${id} no encontrado`);
    }
    if (user.authProvider !== 'LOCAL' || !user.passwordHash) {
      throw new BadRequestException(
        'Esta cuenta inicia sesión con SSO corporativo; la contraseña no se gestiona aquí.',
      );
    }

    const matches = await this.authService.comparePassword(dto.currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }

    const passwordHash = await this.authService.hashPassword(dto.newPassword);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { success: true };
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
