import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const WEB = process.env.WEB_URL || 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'screenshots');
const REPORT = path.join(__dirname, 'reports', 'summary.json');
const OUTLET = 'DEMO01';

interface ScreenReport {
  screen: string;
  width: number;
  console: string[];
  pageErrors: string[];
  networkFailures: string[];
  screenshot: string;
}

const reports: ScreenReport[] = [];

function collect(page: Page, screen: string, width: number): ScreenReport {
  const report: ScreenReport = { screen, width, console: [], pageErrors: [], networkFailures: [], screenshot: '' };
  reports.push(report);
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      report.console.push(`${msg.type()}: ${msg.text().slice(0, 300)}`);
    }
  });
  page.on('pageerror', (error) => report.pageErrors.push(error.message.slice(0, 300)));
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400 && !url.endsWith('/favicon.ico') && !url.includes('favicon')) {
      report.networkFailures.push(`${response.status()} ${url}`);
    }
  });
  return report;
}

async function shot(page: Page, report: ScreenReport) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${report.screen}-${report.width}.png`);
  await page.screenshot({ path: file, fullPage: true });
  report.screenshot = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
}

async function setupViaUi(page: Page, role: 'CASHIER' | 'KDS' | 'DISPLAY') {
  await page.goto(WEB);
  await page.getByRole('textbox', { name: 'Alamat server' }).fill(API);
  await page.getByRole('textbox', { name: 'Kode outlet' }).fill(OUTLET);
  if (role === 'KDS') await page.getByRole('button', { name: 'Dapur (KDS)' }).click();
  if (role === 'DISPLAY') await page.getByRole('button', { name: 'Display' }).click();
  await page.getByRole('button', { name: 'Simpan' }).click();
  if (role === 'DISPLAY') {
    await expect(page.getByRole('textbox', { name: 'Masukkan kode pairing 6 digit' })).toBeVisible();
  } else {
    await expect(page.getByText('Pilih staf')).toBeVisible();
  }
}

async function loginPin(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  for (const digit of ['1', '2', '3', '4', '5', '6']) {
    await page.getByLabel(digit, { exact: true }).click();
  }
}

async function apiCall<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/v1${url}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${JSON.stringify(body)}`);
  return body as T;
}

test.afterAll(() => {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(
    REPORT,
    JSON.stringify(
      {
        api: API,
        web: WEB,
        screens: reports,
        summary: {
          screens: reports.length,
          consoleIssues: reports.reduce((n, r) => n + r.console.length, 0),
          pageErrors: reports.reduce((n, r) => n + r.pageErrors.length, 0),
          networkFailures: reports.reduce((n, r) => n + r.networkFailures.length, 0),
        },
      },
      null,
      2,
    ),
  );
});

for (const width of [390, 768, 1100]) {
  test(`kasir tunai @${width}px: setup -> login -> shift -> checkout -> sukses`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();

    await setupViaUi(page, 'CASHIER');
    let r = collect(page, 'setup', width);
    await shot(page, r);

    await loginPin(page, 'Adi');

    await expect(page.getByRole('button', { name: 'Buka shift' })).toBeVisible();
    r = collect(page, 'login', width);
    await shot(page, r);

    await page.getByRole('button', { name: 'Buka shift' }).click();
    await expect(page.getByRole('heading', { name: 'Beranda Kasir' })).toBeVisible();
    r = collect(page, 'shift', width);
    await shot(page, r);

    await page.getByRole('button', { name: '+', exact: true }).first().click();
    await page.getByRole('button', { name: '+', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Bayar', exact: true })).toBeEnabled();
    r = collect(page, 'cashier', width);
    await shot(page, r);

    await page.getByRole('button', { name: 'Bayar', exact: true }).click();
    await expect(page.getByText('Pembayaran Tunai').first()).toBeVisible();
    await page.getByRole('button', { name: /Bayar & Cetak Tiket/ }).click();
    await expect(page.getByText('Tiket siap').first()).toBeVisible({ timeout: 30_000 });
    r = collect(page, 'payment-success', width);
    await shot(page, r);

    await context.close();
  });
}

test('KDS dan Display menerima event real-time', async ({ browser }) => {
  const kdsContext = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const kds = await kdsContext.newPage();
  await setupViaUi(kds, 'KDS');
  await loginPin(kds, 'Budi');
  await expect(kds.getByText('Dapur').first()).toBeVisible();
  let r = collect(kds, 'kds', 1100);
  await shot(kds, r);

  const displayContext = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const display = await displayContext.newPage();
  await setupViaUi(display, 'DISPLAY');
  r = collect(display, 'display-pairing', 1100);
  await shot(display, r);

  const owner = await apiCall<{ accessToken: string }>('/auth/pin-login', {
    method: 'POST',
    body: JSON.stringify({ outletCode: OUTLET, userId: '00000000-0000-0000-0000-000000000503', pin: '123456' }),
  });
  const pairing = await apiCall<{ code: string }>('/auth/display-pair-code', {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner.accessToken}` },
  });
  await display.getByRole('textbox', { name: 'Masukkan kode pairing 6 digit' }).fill(pairing.code);
  await display.getByRole('button', { name: 'Hubungkan' }).click();
  await expect(display.getByText('Menunggu tiket…')).toBeVisible();
  r = collect(display, 'display-ready', 1100);
  await shot(display, r);

  // Checkout dari kasir lain untuk memicu event ke KDS & Display.
  const cashContext = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const cash = await cashContext.newPage();
  await setupViaUi(cash, 'CASHIER');
  await loginPin(cash, 'Adi');
  await expect(cash.getByRole('button', { name: 'Buka shift' })).toBeVisible();
  const cashierAuth = await apiCall<{ accessToken: string }>('/auth/pin-login', {
    method: 'POST',
    body: JSON.stringify({ outletCode: OUTLET, userId: '00000000-0000-0000-0000-000000000501', pin: '123456' }),
  });
  const makerAuth = await apiCall<{ accessToken: string }>('/auth/pin-login', {
    method: 'POST',
    body: JSON.stringify({ outletCode: OUTLET, userId: '00000000-0000-0000-0000-000000000502', pin: '123456' }),
  });
  try {
    await apiCall('/shifts/open', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cashierAuth.accessToken}` },
      body: JSON.stringify({ openingCash: 100000 }),
    });
  } catch {
    // Shift sudah terbuka.
  }

  const menus = await apiCall<any[]>('/menus', { headers: { Authorization: `Bearer ${cashierAuth.accessToken}` } });
  const item = menus.find((m) => m.name === 'Kopi Susu');
  const validation = await apiCall<{ total: number }>('/orders/validate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cashierAuth.accessToken}` },
    body: JSON.stringify({ items: [{ menuId: item.id, qty: 1 }] }),
  });
  const idem = uuid();
  await apiCall('/orders/checkout', {
    method: 'POST',
    headers: { 'Idempotency-Key': idem, Authorization: `Bearer ${cashierAuth.accessToken}` },
    body: JSON.stringify({
      items: [{ menuId: item.id, qty: 1 }],
      orderType: 'TAKEAWAY',
      payments: [{ method: 'CASH', amount: validation.total }],
      idempotencyKey: idem,
      clientTicketId: idem,
    }),
  });

  await expect(kds.getByText(/A-\d{3}/).first()).toBeVisible({ timeout: 20_000 });
  r = collect(kds, 'kds-realtime', 1100);
  await shot(kds, r);

  // Tandai subtiket siap => event ticket:ready harus tampil di Display.
  const tickets = await apiCall<{ tickets: any[] }>('/tickets', { headers: { Authorization: `Bearer ${cashierAuth.accessToken}` } });
  const latest = tickets.tickets[0];
  const bar = latest.subtickets.find((s: any) => s.station?.code === 'BAR');
  for (const status of ['IN_PROGRESS', 'READY']) {
    await apiCall(`/tickets/subtickets/${bar.id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${makerAuth.accessToken}` },
      body: JSON.stringify({ status }),
    });
  }
  await expect(display.getByText(latest.ticketNumber)).toBeVisible({ timeout: 20_000 });
  r = collect(display, 'display-realtime', 1100);
  await shot(display, r);

  await kdsContext.close();
  await displayContext.close();
  await cashContext.close();
});
