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
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedSocket extends Socket {
  user?: {
    sub: string;
    outletId: string;
    role: string;
    shiftId?: string;
    stationId?: string | null;
    stationIds?: string[];
  };
}

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private userSockets = new Map<string, Set<string>>(); // userId -> socketIds
  private outletRooms = new Map<string, Set<string>>(); // outletId -> socketIds

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
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
      void client.join(`outlet:${payload.outletId}`)
      void client.join(`user:${payload.sub}`)

      // Track for cleanup
      if (!this.userSockets.has(payload.sub)) {
        this.userSockets.set(payload.sub, new Set());
      }
      this.userSockets.get(payload.sub)!.add(client.id);

      if (!this.outletRooms.has(payload.outletId)) {
        this.outletRooms.set(payload.outletId, new Set());
      }
      this.outletRooms.get(payload.outletId)!.add(client.id);

      // Makers join the rooms of every station they are assigned to.
      if (payload.role === 'MAKER') {
        const stationIds = payload.stationIds?.length
          ? payload.stationIds
          : payload.stationId
            ? [payload.stationId]
            : [];
        for (const stationId of stationIds) {
          const station = await this.prisma.station.findUnique({
            where: { id: stationId },
            select: { code: true },
          });
          if (station) {
            void client.join(`station:${payload.outletId}:${station.code}`)
          } else {
            this.logger.warn(`Maker ${payload.sub} has unknown stationId ${stationId}`);
          }
        }
        if (stationIds.length === 0) {
          this.logger.warn(`Maker ${payload.sub} is not assigned to any station; joining no station room`);
        }
      }

      this.logger.log(`Client ${client.id} connected: user=${payload.sub}, outlet=${payload.outletId}, role=${payload.role}`);
    } catch (error: unknown) {
      this.logger.warn(`Client ${client.id} auth failed: ${error instanceof Error ? error.message : String(error)}`);
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

    void client.join(`station:${client.user.outletId}:${data.stationCode}`)
    return { success: true };
  }

  @SubscribeMessage('leave-station')
  handleLeaveStation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { stationCode: string },
  ) {
    if (!client.user) return { success: false, error: 'Not authenticated' };

    void client.leave(`station:${client.user.outletId}:${data.stationCode}`)
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

  emitTicketEtaUpdated(outletId: string, event: any) {
    this.server.to(`outlet:${outletId}`).emit('ticket:eta-updated', event);
  }

  emitStationQueueUpdated(outletId: string, event: any) {
    this.server.to(`outlet:${outletId}`).emit('station:queue-updated', event);
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
    return this.server.engine?.clientsCount || 0;
  }
}