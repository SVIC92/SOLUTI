import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

/**
 * Namespace /notifications: cada usuario autenticado se une a su propia room
 * (`user:<id>`) para recibir sus notificaciones in-app en tiempo real. La conexión
 * se autentica con el mismo JWT de acceso que usa la API REST (query param `token`).
 */
@Injectable()
@WebSocketGateway({ namespace: 'notifications', cors: { origin: '*' } })
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = client.handshake.auth?.token ?? client.handshake.query?.token;
      const payload = await this.jwt.verifyAsync(String(token), {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      await client.join(`user:${payload.sub}`);
    } catch {
      this.logger.warn(`Conexión WebSocket rechazada: token inválido (${client.id})`);
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // No-op: Socket.IO limpia las rooms automáticamente al desconectar.
  }

  emitToUser(userId: string, event: 'notification.new', data: unknown): void {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
