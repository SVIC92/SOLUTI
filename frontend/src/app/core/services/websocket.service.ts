import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { TokenService } from '../auth/token.service';

/** Conexión al namespace /notifications (Socket.IO) para la campana de notificaciones. */
@Injectable({ providedIn: 'root' })
export class WebsocketService implements OnDestroy {
  private socket?: Socket;
  private readonly notifications$ = new Subject<unknown>();

  constructor(private readonly tokens: TokenService) {}

  connect(): void {
    if (this.socket?.connected) return;

    this.socket = io(`${environment.wsUrl}/notifications`, {
      auth: { token: this.tokens.getAccessToken() },
    });

    this.socket.on('notification.new', (payload) => this.notifications$.next(payload));
  }

  get notifications() {
    return this.notifications$.asObservable();
  }

  ngOnDestroy(): void {
    this.socket?.disconnect();
  }
}
