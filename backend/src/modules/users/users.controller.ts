import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '../../generated/prisma/enums.js';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(RoleName.ADMIN)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @Roles(RoleName.ADMIN)
  findAll(@Query('role') role?: RoleName) {
    return this.usersService.findAll(role);
  }

  // Rutas de autoservicio de perfil ("me"): deben declararse antes de ":id" para
  // que Nest no las capture como si "me" fuera un id de usuario. Sin @Roles(...):
  // cualquier usuario autenticado puede ver/editar su propio perfil.
  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findOne(user.sub);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  @Post('me/change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(user.sub, dto);
  }

  @Get(':id')
  @Roles(RoleName.ADMIN)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleName.ADMIN)
  update(@CurrentUser() currentUser: AuthenticatedUser, @Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    // Un admin no puede desactivarse ni degradarse a sí mismo por esta vía — evita
    // que la única cuenta ADMIN activa se bloquee a sí misma por accidente.
    if (currentUser.sub === id && (dto.isActive === false || (dto.role && dto.role !== RoleName.ADMIN))) {
      throw new BadRequestException('No puedes desactivar tu propia cuenta ni quitarte el rol de administrador.');
    }
    return this.usersService.adminUpdate(id, dto);
  }
}
