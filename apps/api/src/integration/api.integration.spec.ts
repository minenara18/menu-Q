/**
 * Integration tests against a SEPARATE PostgreSQL database (orderq_test).
 *
 * Safety: DATABASE_URL_TEST must exist and must not equal DATABASE_URL,
 * otherwise the suite refuses to run. Every test gets a freshly reset
 * and seeded database (demo IDs from SEED_IDS).
 */
import * as dotenv from 'dotenv';
dotenv.config();

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error('DATABASE_URL_TEST is not set. Refusing to run integration tests.');
}
if (testUrl === process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL_TEST must not equal DATABASE_URL. Refusing to run integration tests.');
}
process.env.DATABASE_URL = testUrl;

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PaymentsGateway } from '../modules/payments/payments.gateway';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ManagerPinService } from '../modules/auth/manager-pin.service';
import { XenditPaymentGateway } from '../modules/payments/xendit-payment.gateway';
import { AppModule } from '../app.module';
import { resetAndSeed, SEED_IDS } from '../../prisma/seed-core';
import { createHmac } from 'crypto';

const OUTLET = SEED_IDS.outlet;
const ADI = SEED_IDS.userAdi; // CASHIER
const BUDI = SEED_IDS.userBudi; // MAKER (BAR)
const SINTA = SEED_IDS.userSinta; // OWNER
const KOPI_SUSU = SEED_IDS.menuKopiSusu; // BAR
const MIE_GORENG = SEED_IDS.menuMieGoreng; // KITCHEN

describe('Order-Q API (integration, separate DB)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetAndSeed(prisma);
    // Clear in-memory manager-PIN lockout state between tests
    const managerPin = app.get(ManagerPinService) as unknown as { attempts: Map<string, unknown> };
    managerPin.attempts?.clear();
    // Clear in-memory throttler state so rate-limit tests are deterministic.
    const storage = app.get(ThrottlerStorage) as unknown as {
      storage: Record<string, unknown>;
      timeoutIds: NodeJS.Timeout[];
    };
    for (const key of Object.keys(storage.storage)) delete storage.storage[key];
    storage.timeoutIds.forEach(clearTimeout);
    storage.timeoutIds = [];
  });

  async function login(userId: string) {
    const res = await request(server).post('/v1/auth/pin-login').send({ outletId: OUTLET, userId, pin: '123456' });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  async function openShiftAndRelogin(userId: string, openingCash = 100000) {
    const t1 = await login(userId);
    const open = await request(server).post('/v1/shifts/open').set('Authorization', `Bearer ${t1}`).send({ openingCash });
    expect(open.status).toBe(201);
    const shiftId = open.body.id as string;
    const token = await login(userId); // re-login so the JWT carries shiftId
    return { token, shiftId };
  }

  function checkoutBody(items: Array<{ menuId: string; qty: number }>, payments: Array<{ method: string; amount: number }>, idem: string, discount?: { type: 'amount' | 'percent'; value: number }) {
    return { items, orderType: 'TAKEAWAY', payments, idempotencyKey: idem, discount };
  }

  const IDEM = () => '11111111-1111-4111-8111-' + Math.random().toString(16).slice(2, 14).padStart(12, '0');

  it('concurrency: N parallel checkouts for 1-portion stock → exactly one succeeds', async () => {
    // Leave exactly one portion of espresso (Kopi Susu needs 18g)
    await prisma.ingredient.update({ where: { id: SEED_IDS.ingEspresso }, data: { currentQty: 18 } });

    const { token } = await openShiftAndRelogin(ADI);

    const doCheckout = () => {
      const idem = IDEM();
      return request(server)
        .post('/v1/orders/checkout')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idem)
        .send(checkoutBody([{ menuId: KOPI_SUSU, qty: 1 }], [{ method: 'CASH', amount: 20880 }], idem));
    };

    const results = await Promise.all([doCheckout(), doCheckout(), doCheckout(), doCheckout(), doCheckout()]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);

    const espresso = await prisma.ingredient.findUniqueOrThrow({ where: { id: SEED_IDS.ingEspresso } });
    expect(espresso.currentQty).toBe(0); // never negative

    const tickets = await prisma.ticket.findMany({ where: { shift: { outletId: OUTLET } } });
    expect(tickets).toHaveLength(1);
    const numbers = tickets.map((t) => t.ticketNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('idempotency: same Idempotency-Key twice → one ticket; QRIS webhook twice → one effect', async () => {
    const { token } = await openShiftAndRelogin(ADI);
    const idem = IDEM();
    const body = checkoutBody([{ menuId: KOPI_SUSU, qty: 1 }], [{ method: 'CASH', amount: 20880 }], idem);

    const [r1, r2] = await Promise.all([
      request(server).post('/v1/orders/checkout').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', idem).send(body),
      request(server).post('/v1/orders/checkout').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', idem).send(body),
    ]);
    expect([r1.status, r2.status]).toContain(200);
    const expressCount = await prisma.ticket.count({ where: { payments: { some: { idempotencyKey: idem } } } });
    expect(expressCount).toBe(1);
    const t1 = r1.body?.ticket?.id ?? r2.body?.ticket?.id;
    expect(r1.body?.ticket?.id ?? r2.body?.ticket?.id).toBe(t1);

    // QRIS flow: checkout with QRIS payment then pay via webhook twice
    const idem2 = IDEM();
    const qr = await request(server)
      .post('/v1/orders/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idem2)
      .send(checkoutBody([{ menuId: KOPI_SUSU, qty: 1 }], [{ method: 'QRIS', amount: 20880 }], idem2));
    expect(qr.status).toBe(200);
    const qrisTicketId = qr.body.ticket.id as string;

    const created = await request(server).post('/v1/payments/qris').set('Authorization', `Bearer ${token}`).send({ ticketId: qrisTicketId });
    expect([200, 201]).toContain(created.status);
    const paymentId = created.body.paymentId as string;

    const webhookBody = { paymentId, status: 'paid', outletId: OUTLET };
    const w1 = await request(server).post('/v1/payments/webhooks/qris').send(webhookBody);
    const w2 = await request(server).post('/v1/payments/webhooks/qris').send(webhookBody);
    expect(w1.status).toBe(200);
    expect(w2.status).toBe(200);

    const payments = await prisma.payment.findMany({ where: { qrisRef: paymentId } });
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('PAID');

    const stockMoves = await prisma.stockMove.count({ where: { refId: qrisTicketId, reason: 'SALE' } });
    expect(stockMoves).toBe(3); // Kopi Susu recipe: espresso + susu + gula, exactly one sale
  });

  it('QRIS timeout: expired pending payment is failed, ticket cancelled, stock released via stock_moves', async () => {
    const { token } = await openShiftAndRelogin(ADI);
    const idem = IDEM();
    const qr = await request(server)
      .post('/v1/orders/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idem)
      .send(checkoutBody([{ menuId: KOPI_SUSU, qty: 1 }], [{ method: 'QRIS', amount: 20880 }], idem));
    expect(qr.status).toBe(200);
    const ticketId = qr.body.ticket.id as string;

    const espBefore = await prisma.ingredient.findUniqueOrThrow({ where: { id: SEED_IDS.ingEspresso } });
    expect(espBefore.currentQty).toBe(2000 - 18);

    // Simulate a payment that has been pending for 6 minutes
    await prisma.payment.updateMany({ where: { ticketId }, data: { createdAt: new Date(Date.now() - 6 * 60 * 1000) } });

    const gateway = app.get(PaymentsGateway) as unknown as { checkExpiredPayments(): Promise<void> };
    await gateway.checkExpiredPayments();

    const payment = await prisma.payment.findFirstOrThrow({ where: { ticketId } });
    expect(payment.status).toBe('FAILED');

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe('CANCELLED');

    const espAfter = await prisma.ingredient.findUniqueOrThrow({ where: { id: SEED_IDS.ingEspresso } });
    expect(espAfter.currentQty).toBe(2000);

    const refunds = await prisma.stockMove.count({ where: { refId: ticketId, reason: 'REFUND' } });
    expect(refunds).toBe(3);
  });

  it('split payment: totals match, ticket stays one, QRIS stays pending until paid', async () => {
    const { token } = await openShiftAndRelogin(ADI);
    const idem = IDEM();
    const res = await request(server)
      .post('/v1/orders/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idem)
      .send(checkoutBody(
        [{ menuId: KOPI_SUSU, qty: 1 }],
        [
          { method: 'CASH', amount: 10000 },
          { method: 'QRIS', amount: 10880 },
        ],
        idem,
      ));
    expect(res.status).toBe(200);
    expect(res.body.ticket.totalAmount).toBe(20880);

    const ticketId = res.body.ticket.id as string;
    const payments = await prisma.payment.findMany({ where: { ticketId } });
    expect(payments).toHaveLength(2);
    expect(payments.reduce((s, p) => s + p.amount, 0)).toBe(20880);
    expect(payments.find((p) => p.method === 'CASH')?.status).toBe('PAID');
    expect(payments.find((p) => p.method === 'QRIS')?.status).toBe('PENDING');
  });

  it('shift close: expected/variance, manager PIN above threshold, immutability, forceClose', async () => {
    const { token, shiftId } = await openShiftAndRelogin(ADI, 100000);
    const idem = IDEM();
    const sale = await request(server)
      .post('/v1/orders/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idem)
      .send(checkoutBody([{ menuId: KOPI_SUSU, qty: 1 }], [{ method: 'CASH', amount: 20880 }], idem));
    expect(sale.status).toBe(200);

    const summary = await request(server).get(`/v1/shifts/${shiftId}/summary`).set('Authorization', `Bearer ${token}`);
    expect(summary.status).toBe(200);
    expect(summary.body.shift.expectedCash).toBe(100000 + 20880);

    // Close above threshold without manager PIN -> 400
    const noPin = await request(server)
      .post(`/v1/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ countedCash: 100000 + 20880 + 20000, cashCounts: [], forceClose: true });
    expect(noPin.status).toBe(400);

    // Wrong manager PIN -> 403
    const wrongPin = await request(server)
      .post(`/v1/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ countedCash: 100000 + 20880 + 20000, cashCounts: [], managerPin: '000000', forceClose: true });
    expect(wrongPin.status).toBe(403);

    // Open ticket blocks close without forceClose -> 400
    const openBlock = await request(server)
      .post(`/v1/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ countedCash: 100000 + 20880, cashCounts: [], forceClose: false });
    expect(openBlock.status).toBe(400);

    // forceClose closes despite the ORDERED ticket
    const forced = await request(server)
      .post(`/v1/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ countedCash: 100000 + 20880, cashCounts: [], forceClose: true });
    expect(forced.status).toBe(200);
    expect(forced.body.status).toBe('CLOSED');

    // Shift is immutable after close
    const again = await request(server)
      .post(`/v1/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ countedCash: 100000 + 20880, cashCounts: [], forceClose: true });
    expect(again.status).toBe(400);
  });

  it('shift close with variance below threshold needs no manager PIN', async () => {
    const { token, shiftId } = await openShiftAndRelogin(ADI, 100000);
    const res = await request(server)
      .post(`/v1/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ countedCash: 100500, cashCounts: [] });
    expect(res.status).toBe(200);
    expect(res.body.variance).toBe(500);
  });

  it('shift close with variance above threshold accepts the owner PIN', async () => {
    const { token, shiftId } = await openShiftAndRelogin(ADI, 100000);
    const res = await request(server)
      .post(`/v1/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ countedCash: 120000, cashCounts: [], managerPin: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.variance).toBe(20000);

    // Audit log must record the approver
    const audit = await prisma.auditLog.findFirst({ where: { entityId: shiftId, action: 'PIN_APPROVE' } });
    expect(audit?.actorId).toBe(SINTA);
  });

  it('manager PIN lockout: repeated wrong PINs lock out further attempts and are audited', async () => {
    const { token, shiftId } = await openShiftAndRelogin(ADI, 100000);

    for (let i = 0; i < 5; i++) {
      const res = await request(server)
        .post(`/v1/shifts/${shiftId}/close`)
        .set('Authorization', `Bearer ${token}`)
        .send({ countedCash: 150000, cashCounts: [], managerPin: '000000' });
      expect(res.status).toBe(403);
    }

    // 6th attempt with the CORRECT pin is rejected because of lockout
    const locked = await request(server)
      .post(`/v1/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ countedCash: 150000, cashCounts: [], managerPin: '123456' });
    expect(locked.status).toBe(403);

    const failures = await prisma.auditLog.count({ where: { entityId: shiftId, action: 'MANAGER_PIN_FAILED' } });
    expect(failures).toBeGreaterThanOrEqual(5);
  });

  it('RBAC: cashier cannot call owner-only endpoints; maker only sees own station tickets', async () => {
    const { token } = await openShiftAndRelogin(ADI);

    // Cashier is forbidden from owner-only menus create
    const forbidden = await request(server)
      .post('/v1/menus')
      .set('Authorization', `Bearer ${token}`)
      .send({ categoryId: SEED_IDS.catMinuman, stationId: SEED_IDS.stationBar, name: 'HackMenu', price: 1000 });
    expect(forbidden.status).toBe(403);

    // Checkout one BAR and one KITCHEN ticket
    const mk = (menuId: string, total: number) => {
      const idem = IDEM();
      return request(server)
        .post('/v1/orders/checkout')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idem)
        .send(checkoutBody([{ menuId, qty: 1 }], [{ method: 'CASH', amount: total }], idem));
    };
    const barSale = await mk(KOPI_SUSU, 20880);
    const kitchenSale = await mk(MIE_GORENG, 19720); // 17000 + 1870 tax + 850 service
    expect(barSale.status).toBe(200);
    expect(kitchenSale.status).toBe(200);

    // Maker (Budi, BAR) lists tickets: only tickets with a BAR sub-ticket appear
    const tokenMaker = await login(BUDI);
    const list = await request(server).get('/v1/tickets').set('Authorization', `Bearer ${tokenMaker}`);
    expect(list.status).toBe(200);
    const numbers = (list.body.tickets ?? list.body).map((t: { ticketNumber: string }) => t.ticketNumber);
    expect(numbers).toContain(barSale.body.ticket.ticketNumber);
    expect(numbers).not.toContain(kitchenSale.body.ticket.ticketNumber);

    // Maker cannot update a KITCHEN sub-ticket
    const kitchenSub = kitchenSale.body.ticket.subtickets.find((s: { stationCode: string }) => s.stationCode === 'KITCHEN');
    const patch = await request(server)
      .patch(`/v1/tickets/subtickets/${kitchenSub.id}/status`)
      .set('Authorization', `Bearer ${tokenMaker}`)
      .send({ status: 'IN_PROGRESS' });
    expect(patch.status).toBe(403);

    // Maker can update a BAR sub-ticket
    const barSub = barSale.body.ticket.subtickets.find((s: { stationCode: string }) => s.stationCode === 'BAR');
    const patchOk = await request(server)
      .patch(`/v1/tickets/subtickets/${barSub.id}/status`)
      .set('Authorization', `Bearer ${tokenMaker}`)
      .send({ status: 'IN_PROGRESS' });
    expect(patchOk.status).toBe(200);
  });

  it('discount: percent discount is validated and reduces the total; payments must match', async () => {
    const { token } = await openShiftAndRelogin(ADI);
    const idem = IDEM();
    const res = await request(server)
      .post('/v1/orders/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idem)
      .send(checkoutBody([{ menuId: KOPI_SUSU, qty: 1 }], [{ method: 'CASH', amount: 18792 }], idem, { type: 'percent', value: 10 }));
    expect(res.status).toBe(200);
    // subtotal 18000 + tax 1980 + service 900 = 20880; 10% discount = 2088 → 18792
    expect(res.body.ticket.totalAmount).toBe(18792);
    expect(res.body.receipt.discountAmount).toBe(2088);

    // Payment total must equal the discounted total
    const bad = IDEM();
    const badRes = await request(server)
      .post('/v1/orders/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', bad)
      .send(checkoutBody([{ menuId: KOPI_SUSU, qty: 1 }], [{ method: 'CASH', amount: 20880 }], bad, { type: 'percent', value: 10 }));
    expect(badRes.status).toBe(400);

    // Invalid discount percent rejected
    const invalid = IDEM();
    const invalidRes = await request(server)
      .post('/v1/orders/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', invalid)
      .send(checkoutBody([{ menuId: KOPI_SUSU, qty: 1 }], [{ method: 'CASH', amount: 18792 }], invalid, { type: 'percent', value: 150 }));
    expect(invalidRes.status).toBe(400);
  });

  it('split + discount combined: percent discount applied across the ticket, payments match', async () => {
    const { token } = await openShiftAndRelogin(ADI);
    const idem = IDEM();
    const total = 18792; // 20880 - 10%
    const res = await request(server)
      .post('/v1/orders/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idem)
      .send(checkoutBody(
        [{ menuId: KOPI_SUSU, qty: 1 }],
        [
          { method: 'CASH', amount: 10000 },
          { method: 'QRIS', amount: 8792 },
        ],
        idem,
        { type: 'percent', value: 10 },
      ));
    expect(res.status).toBe(200);
    expect(res.body.ticket.totalAmount).toBe(total);
  });

  it('xendit webhook: missing/invalid secret or signature is rejected', async () => {
    const cfg = { get: (key: string) => ({ 'app.qris.webhookSecret': 'test-secret', 'app.qris.apiKey': 'xnd_test' }[key]) } as never;
    const gateway = new XenditPaymentGateway(cfg);
    const payload = { id: 'qr_123', status: 'PAID', amount: 1000 };

    const bad = await gateway.verifyWebhook(payload, 'not-a-valid-signature');
    expect(bad.valid).toBe(false);

    const goodSig = createHmac('sha256', 'test-secret').update(JSON.stringify(payload)).digest('hex');
    const good = await gateway.verifyWebhook(payload, goodSig);
    expect(good.valid).toBe(true);
    expect(good.paymentId).toBe('qr_123');
    expect(good.status).toBe('paid');

    // No secret configured → always rejected
    const cfgNoSecret = { get: () => undefined } as never;
    const gatewayNoSecret = new XenditPaymentGateway(cfgNoSecret);
    const rejected = await gatewayNoSecret.verifyWebhook(payload, goodSig);
    expect(rejected.valid).toBe(false);
  });

  it('health: liveness and readiness respond without auth and are not throttled', async () => {
    const live = await request(server).get('/health');
    expect(live.status).toBe(200);
    expect(live.body.status).toBe('ok');

    const ready = await request(server).get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ready');
    expect(ready.body.database).toBe('up');
  });

  it('throttle: repeated PIN logins for the same user/IP end in 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(server)
        .post('/v1/auth/pin-login')
        .send({ outletId: OUTLET, userId: ADI, pin: '123456' });
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(5);
    expect(statuses[5]).toBe(429);
  });

  it('QRIS expiry sweep is safe when two callers run in parallel (no double refund)', async () => {
    const { token } = await openShiftAndRelogin(ADI);
    const idem = IDEM();
    const qr = await request(server)
      .post('/v1/orders/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idem)
      .send(checkoutBody([{ menuId: KOPI_SUSU, qty: 1 }], [{ method: 'QRIS', amount: 20880 }], idem));
    expect(qr.status).toBe(200);
    const ticketId = qr.body.ticket.id as string;

    await prisma.payment.updateMany({
      where: { ticketId },
      data: { createdAt: new Date(Date.now() - 6 * 60 * 1000) },
    });

    const gateway = app.get(PaymentsGateway) as unknown as { checkExpiredPayments(): Promise<void> };
    await Promise.all([gateway.checkExpiredPayments(), gateway.checkExpiredPayments()]);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe('CANCELLED');

    const refunds = await prisma.stockMove.count({ where: { refId: ticketId, reason: 'REFUND' } });
    expect(refunds).toBe(3); // exactly one refund pass, not two

    const esp = await prisma.ingredient.findUniqueOrThrow({ where: { id: SEED_IDS.ingEspresso } });
    expect(esp.currentQty).toBe(2000);
  });
});
