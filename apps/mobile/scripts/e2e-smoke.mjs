// Automated slice of the M1 vertical. Requires a running local API + seeded demo data.
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const base = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const API = `${base}/v1`;

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function waitEvent(socket, name, ms = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No ${name} within ${ms}ms`)), ms);
    socket.once(name, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function main() {
  const options = await call('/auth/login-options?outletCode=DEMO01');
  const adi = options.staff.find((s) => s.name === 'Adi');
  const budi = options.staff.find((s) => s.name === 'Budi');
  if (!adi || !budi) throw new Error('Seed staf tidak ditemukan; jalankan db:seed.');

  const cashier = await call('/auth/pin-login', {
    method: 'POST',
    body: { outletCode: 'DEMO01', userId: adi.id, pin: '123456' },
  });
  const maker = await call('/auth/pin-login', {
    method: 'POST',
    body: { outletCode: 'DEMO01', userId: budi.id, pin: '123456' },
  });

  try {
    await call('/shifts/open', { method: 'POST', token: cashier.accessToken, body: { openingCash: 100000 } });
  } catch {
    // Shift sudah terbuka dari seed/run sebelumnya — lanjut.
  }

  // Token yang sama dipakai: server menurunkan shift aktif saat checkout.

  const menus = await call('/menus', { token: cashier.accessToken });
  const kopi = menus.find((m) => m.name === 'Kopi Susu');
  if (!kopi) throw new Error('Menu Kopi Susu tidak ditemukan.');

  const items = [{ menuId: kopi.id, qty: 1 }];
  const validation = await call('/orders/validate', {
    method: 'POST',
    token: cashier.accessToken,
    body: { items },
  });

  const socket = io(base, {
    transports: ['websocket'],
    reconnection: false,
    auth: { token: cashier.accessToken },
  });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  const createdPromise = waitEvent(socket, 'ticket:created');
  const readyPromise = waitEvent(socket, 'ticket:ready');

  const clientTicketId = randomUUID();
  const checkout = await call('/orders/checkout', {
    method: 'POST',
    token: cashier.accessToken,
    body: {
      items,
      orderType: 'TAKEAWAY',
      payments: [{ method: 'CASH', amount: validation.total }],
      idempotencyKey: clientTicketId,
      clientTicketId,
      customerName: 'Pelanggan Uji',
      tableLabel: 'Meja 7',
    },
  });
  const created = await createdPromise;
  const { etaMin, etaMax } = checkout.ticket;
  if (!(etaMin >= 1 && etaMax >= etaMin && etaMax <= 60)) {
    throw new Error(`ETA tidak masuk akal untuk Kopi Susu: ${etaMin}-${etaMax} menit`);
  }

  const tickets = await call('/tickets', { token: cashier.accessToken });
  const ticket = tickets.tickets.find((t) => t.id === checkout.ticket.id);
  const barSub = ticket.subtickets.find((s) => s.station?.code === 'BAR');

  await call(`/tickets/subtickets/${barSub.id}/status`, {
    method: 'PATCH',
    token: maker.accessToken,
    body: { status: 'IN_PROGRESS' },
  });
  await call(`/tickets/subtickets/${barSub.id}/status`, {
    method: 'PATCH',
    token: maker.accessToken,
    body: { status: 'READY' },
  });
  await readyPromise;
  socket.disconnect();

  console.log(
    `OK: ${checkout.ticket.ticketNumber} ETA ${checkout.ticket.etaMin}-${checkout.ticket.etaMax} menit; ` +
      `created+ready events diterima; tableLabel=${checkout.receipt.tableLabel}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
