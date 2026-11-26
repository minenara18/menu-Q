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

// Dev web origin boleh diizinkan lewat env; produksi tidak berubah bila kosong.
const configuredSocketOrigins = (process.env.SOCKET_CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

interface SocketUser {
  sub: string;
  outletId: string;
  role: string;
  type?: string;
  shiftId?: string;
  stationId?: string | null;
  stationIds?: string[];
}

interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
}

/**
 * Socket.IO gateway.
 *
 * Every handshake must carry a valid JWT. Normal staff tokens can join only
 * their own outlet room (and, for makers, only their assigned station rooms).
 * A DISPLAY token is read-only: it joins only display:{outletId} and receives
 * sanitized ticket:ready / ticket:eta-updated payloads (number, status, ETA).
 */
@Injectable()
@WebSocketGateway({
  cors: { origin: configuredSocketOrigins.length ? configuredSocketOrigins : '*' },
  namespace: '/',
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private userSockets = new Map<string, Set<string>>();
  private outletRooms = new Map<string, Set<string>>();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  private isDisplay(user: SocketUser): boolean {
    return user.type === 'DISPLAY' || user.role === 'DISPLAY';
  }

  private async allowedStationCodes(user: SocketUser): Promise<string[]> {
    if (user.role !== 'MAKER') return [];
    const stationIds = user.stationIds?.length
      ? user.stationIds
      : user.stationId
        ? [user.stationId]
        : [];
    const codes: string[] = [];
    for (const stationId of stationIds) {
      const station = await this.prisma.station.findFirst({
        where: { id: stationId, outletId: user.outletId },
        select: { code: true },
      });
      if (station) codes.push(station.code);
      else this.logger.warn(`Maker ${user.sub} has unknown stationId ${stationId}`);
    }
    return codes;
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('app.jwt.secret'),
      }) as SocketUser;

      if (!payload?.outletId || !payload?.sub) {
        client.disconnect(true);
        return;
      }

      client.user = payload;

      if (this.isDisplay(payload)) {
        // Read-only display: never joins the general outlet/station rooms.
        void client.join(`display:${payload.outletId}`);
        this.logger.log(`Display ${payload.sub} connected for outlet ${payload.outletId}`);
        return;
      }

      void client.join(`outlet:${payload.outletId}`);
      void client.join(`user:${payload.sub}`);

      if (!this.userSockets.has(payload.sub)) {
        this.userSockets.set(payload.sub, new Set());
      }
      this.userSockets.get(payload.sub)!.add(client.id);

      if (!this.outletRooms.has(payload.outletId)) {
        this.outletRooms.set(payload.outletId, new Set());
      }
      this.outletRooms.get(payload.outletId)!.add(client.id);

      for (const code of await this.allowedStationCodes(payload)) {
        void client.join(`station:${payload.outletId}:${code}`);
      }

      this.logger.log(`Client ${client.id} connected: user=${payload.sub}, outlet=${payload.outletId}, role=${payload.role}`);
    } catch (error: unknown) {
      this.logger.warn(`Client ${client.id} auth failed: ${error instanceof Error ? error.message : String(error)}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (!client.user) return;

    const userSockets = this.userSockets.get(client.user.sub);
    if (userSockets) {
      userSockets.delete(client.id);
      if (userSockets.size === 0) this.userSockets.delete(client.user.sub);
    }

    const outletSockets = this.outletRooms.get(client.user.outletId);
    if (outletSockets) {
      outletSockets.delete(client.id);
      if (outletSockets.size === 0) this.outletRooms.delete(client.user.outletId);
    }
  }

  /** Station rooms are only joinable by makers assigned to that station. */
  @SubscribeMessage('join-station')
  async handleJoinStation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { stationCode: string },
  ) {
    if (!client.user || this.isDisplay(client.user)) {
      return { success: false, error: 'Not authorized' };
    }
    const allowed = await this.allowedStationCodes(client.user);
    if (!allowed.includes(data.stationCode)) {
      return { success: false, error: 'Station not allowed' };
    }
    void client.join(`station:${client.user.outletId}:${data.stationCode}`);
    return { success: true };
  }

  @SubscribeMessage('leave-station')
  async handleLeaveStation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { stationCode: string },
  ) {
    if (!client.user || this.isDisplay(client.user)) {
      return { success: false, error: 'Not authorized' };
    }
    void client.leave(`station:${client.user.outletId}:${data.stationCode}`);
    return { success: true };
  }

  private displayPayload(event: any) {
    return {
      ticketNumber: event.ticketNumber,
      status: event.status ?? 'READY',
      etaMin: event.etaMin ?? null,
      etaMax: event.etaMax ?? null,
    };
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
    // Display clients receive only number/status/ETA, never customer data.
    this.server.to(`display:${outletId}`).emit('ticket:ready', this.displayPayload(event));
  }

  emitTicketEtaUpdated(outletId: string, event: any) {
    this.server.to(`outlet:${outletId}`).emit('ticket:eta-updated', event);
    this.server.to(`display:${outletId}`).emit('ticket:eta-updated', this.displayPayload(event));
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

  getConnectedCount(outletId?: string): number {
    if (outletId) {
      return this.outletRooms.get(outletId)?.size || 0;
    }
    return this.server.engine?.clientsCount || 0;
  }
}
