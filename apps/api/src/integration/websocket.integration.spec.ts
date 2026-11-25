import * as dotenv from 'dotenv';
dotenv.config();

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error('DATABASE_URL_TEST is not set. Refusing to run integration tests.');
}
if (testUrl === process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL_TEST must not equal DATABASE_URL.');
}
process.env.DATABASE_URL = testUrl;

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AddressInfo } from 'net';
import { AppModule } from '../app.module';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { PrismaClient } from '@prisma/client';
import { resetAndSeed, SEED_IDS } from '../../prisma/seed-core';

function waitFor<T = any>(socket: Socket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No ${event} within ${ms}ms`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connect(url: string, token?: string): Promise<Socket> {
  const socket = io(url, {
    transports: ['websocket'],
    reconnection: false,
    auth: token ? { token } : {},
  });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

describe('WebSocket authentication and room isolation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
    await app.listen(0);
    const port = (app.getHttpServer().address() as AddressInfo).port;
    url = `http://localhost:${port}`;
  });

  beforeEach(async () => {
    await resetAndSeed(prisma);
  });

  afterEach(async () => {
    for (const socket of sockets) socket.disconnect();
    sockets.length = 0;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('rejects a handshake without a valid token', async () => {
    const socket = io(url, { transports: ['websocket'], reconnection: false });
    const rejected = await new Promise<'disconnect' | 'timeout'>((resolve) => {
      socket.once('disconnect', () => resolve('disconnect'));
      setTimeout(() => resolve('timeout'), 1500);
    });
    expect(rejected).toBe('disconnect');
    expect(socket.connected).toBe(false);
    socket.disconnect();
  });

  it('keeps other outlets out and sends sanitized events to display tokens', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/pin-login')
      .send({ outletId: SEED_IDS.outlet, userId: SEED_IDS.userAdi, pin: '123456' });
    expect(login.status).toBe(200);
    const staffToken = login.body.accessToken as string;

    const display = await request(app.getHttpServer())
      .post('/v1/auth/display-token')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({});
    expect(display.status).toBe(200);

    // A valid JWT for a different outlet (signed with the same app secret).
    const signer = new JwtService({ secret: process.env.JWT_SECRET });
    const otherToken = signer.sign({
      sub: '00000000-0000-0000-0000-000000000999',
      outletId: '00000000-0000-0000-0000-000000000999',
      name: 'Other',
      role: 'CASHIER',
    });

    const staff = await connect(url, staffToken);
    const other = await connect(url, otherToken);
    const displaySocket = await connect(url, display.body.token as string);
    sockets.push(staff, other, displaySocket);

    const event = {
      ticketId: 'ticket-1',
      ticketNumber: 'A-001',
      customerName: 'Rahasia Pelanggan',
      orderType: 'TAKEAWAY',
      status: 'READY',
      etaMin: 6,
      etaMax: 10,
    };

    const staffMessage = waitFor(staff, 'ticket:ready');
    const displayMessage = waitFor(displaySocket, 'ticket:ready');
    let otherReceived = false;
    other.once('ticket:ready', () => {
      otherReceived = true;
    });

    app.get(WebsocketGateway).emitTicketReady(SEED_IDS.outlet, event);

    expect(await staffMessage).toMatchObject({ customerName: 'Rahasia Pelanggan' });
    const displayPayload = await displayMessage;
    expect(displayPayload).toMatchObject({
      ticketNumber: 'A-001',
      status: 'READY',
      etaMin: 6,
      etaMax: 10,
    });
    expect(displayPayload.customerName).toBeUndefined();
    expect(displayPayload.orderType).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(otherReceived).toBe(false);

    // Display never receives sensitive staff-only events.
    let displayGotCreated = false;
    displaySocket.once('ticket:created', () => {
      displayGotCreated = true;
    });
    app.get(WebsocketGateway).emitTicketCreated(SEED_IDS.outlet, {
      id: 'ticket-2',
      ticketNumber: 'A-002',
      customerName: 'Rahasia',
      status: 'ORDERED',
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(displayGotCreated).toBe(false);
  });

  it('only lets makers join their own station rooms', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/pin-login')
      .send({ outletId: SEED_IDS.outlet, userId: SEED_IDS.userCitra, pin: '123456' });
    expect(login.status).toBe(200);

    const maker = await connect(url, login.body.accessToken as string);
    sockets.push(maker);

    const bar = await maker.emitWithAck('join-station', { stationCode: 'BAR' });
    expect(bar).toEqual({ success: true });

    const pastry = await maker.emitWithAck('join-station', { stationCode: 'PASTRY' });
    expect(pastry).toEqual({ success: false, error: 'Station not allowed' });

    const display = await request(app.getHttpServer())
      .post('/v1/auth/display-token')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({});
    // Maker is not allowed to mint display tokens.
    expect(display.status).toBe(403);
  });
});
