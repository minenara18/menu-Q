import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';

interface AuthenticatedSocket extends Socket {
  user?: {
    sub: string;
    outletId: string;
    role: string;
    shiftId?: string;
  };
}

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private userSockets = new Map<string, Set<string>>(); // userId -> socketIds
  private outletRooms = new Map<string, Set<string>>(); // outletId -> socketIds

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('app.jwt.secret'),
      });

      client.user = payload;
      client.join(`outlet:${payload.outletId}`);
      client.join(`user:${payload.sub}`);

      // Track for cleanup
      if (!this.userSockets.has(payload.sub)) {
        this.userSockets.set(payload.sub, new Set());
      }
      this.userSockets.get(payload.sub)!.add(client.id);

      if (!this.outletRooms.has(payload.outletId)) {
        this.outletRooms.set(payload.outletId, new Set());
      }
      this.outletRooms.get(payload.outletId)!.add(client.id);

      // If maker, join station room
      if (payload.role === 'maker') {
        // In real implementation, get user's assigned station
        // For now, join all stations
        const stations = ['BAR', 'KITCHEN', 'PASTRY'];
        for (const station of stations) {
          client.join(`station:${payload.outletId}:${station}`);
        }
      }

      this.logger.log(`Client ${client.id} connected: user=${payload.sub}, outlet=${payload.outletId}, role=${payload.role}`);
    } catch (error) {
      this.logger.warn(`Client ${client.id} auth failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.user) {
      const userSockets = this.userSockets.get(client.user.sub);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.userSockets.delete(client.user.sub);
        }
      }

      const outletSockets = this.outletRooms.get(client.user.outletId);
      if (outletSockets) {
        outletSockets.delete(client.id);
        if (outletSockets.size === 0) {
          this.outletRooms.delete(client.user.outletId);
        }
      }

      this.logger.log(`Client ${client.id} disconnected: user=${client.user.sub}`);
    }
  }

  @SubscribeMessage('join-station')
  handleJoinStation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { stationCode: string },
  ) {
    if (!client.user) return { success: false, error: 'Not authenticated' };

    client.join(`station:${client.user.outletId}:${data.stationCode}`);
    return { success: true };
  }

  @SubscribeMessage('leave-station')
  handleLeaveStation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { stationCode: string },
  ) {
    if (!client.user) return { success: false, error: 'Not authenticated' };

    client.leave(`station:${client.user.outletId}:${data.stationCode}`);
    return { success: true };
  }

  // Event emitters for services
  emitTicketCreated(outletId: string, ticket: any) {
    this.server.to(`outlet:${outletId}`).emit('ticket:created', {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        customerName: ticket.customerName,
        orderType: ticket.orderType,
        status: ticket.status,
        etaMin: ticket.etaMin,
        etaMax: ticket.etaMax,
        totalAmount: ticket.totalAmount,
        createdAt: ticket.createdAt,
      },
      subtickets: ticket.subtickets?.map((st: any) => ({
        id: st.id,
        stationId: st.stationId,
        stationCode: st.station?.code,
        stationName: st.station?.name,
        status: st.status,
      })) || [],
    });
  }

  emitTicketUpdated(outletId: string, event: any) {
    this.server.to(`outlet:${outletId}`).emit('ticket:updated', event);
  }

  emitSubTicketUpdated(outletId: string, event: any) {
    this.server.to(`outlet:${outletId}`).emit('subticket:updated', event);
    this.server.to(`station:${outletId}:${event.stationCode}`).emit('subticket:updated', event);
  }

  emitTicketReady(outletId: string, event: any) {
    this.server.to(`outlet:${outletId}`).emit('ticket:ready', event);
    // Also emit to display room
    this.server.to(`display:${outletId}`).emit('ticket:ready', event);
  }

  emitStockChanged(outletId: string, event: any) {
    this.server.to(`outlet:${outletId}`).emit('stock:changed', event);
  }

  emitShiftClosed(outletId: string, event: any) {
    this.server.to(`outlet:${outletId}`).emit('shift:closed', event);
  }

  emitPrinterStatus(deviceId: string, event: any) {
    this.server.to(`printer:${deviceId}`).emit('printer:status', event);
  }

  // Get connected clients count for monitoring
  getConnectedCount(outletId?: string): number {
    if (outletId) {
      return this.outletRooms.get(outletId)?.size || 0;
    }
    return this.server.sockets.size;
  }
}