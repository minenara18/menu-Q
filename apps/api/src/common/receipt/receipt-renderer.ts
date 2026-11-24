/**
 * Pure ESC/POS text renderer. No I/O: it receives receipt data and returns
 * fixed-width lines plus an ESC/POS byte stream encoded as base64.
 */

export type PaperWidth = 32 | 48;

export function formatRupiah(value: number): string {
  const sign = value < 0 ? '-' : '';
  const digits = Math.abs(Math.round(value)).toString();
  let grouped = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += '.';
    grouped += digits[i];
  }
  return `${sign}Rp ${grouped}`;
}

/** Truncate long names without ever exceeding the available columns. */
export function truncate(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max === 1) return text.slice(0, 1);
  return `${text.slice(0, max - 2)}..`;
}

export function padLine(left: string, right: string, width: PaperWidth): string {
  const l = truncate(left, width);
  const r = truncate(right, width - l.length);
  return l + ' '.repeat(Math.max(0, width - l.length - r.length)) + r;
}

export function center(text: string, width: PaperWidth): string {
  const t = truncate(text, width);
  const left = Math.floor((width - t.length) / 2);
  return ' '.repeat(left) + t + ' '.repeat(width - t.length - left);
}

function rule(char: string, width: PaperWidth): string {
  return char.repeat(width);
}

interface RenderItem {
  name: string;
  qty: number;
  subtotal: number;
  note?: string | null;
}

export interface ReceiptRenderInput {
  outletName: string;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  ticketNumber: string;
  date: string;
  cashierName?: string | null;
  items: RenderItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  serviceAmount: number;
  total: number;
  payments: Array<{ method: string; amount: number; splitGroupId?: string | null }>;
  change: number;
  eta?: { min: number | null; max: number | null };
}

/** Render the customer receipt as fixed-width text lines. */
export function renderReceiptText(receipt: ReceiptRenderInput, width: PaperWidth = 32): string[] {
  const lines: string[] = [];
  const push = (line: string) => lines.push(line.slice(0, width).padEnd(width, ' '));

  push(rule('=', width));
  push(center(receipt.outletName, width));
  if (receipt.receiptHeader) push(center(receipt.receiptHeader, width));
  push(rule('=', width));
  push(receipt.ticketNumber);
  push(receipt.date);
  if (receipt.cashierName) push(padLine('Kasir:', truncate(receipt.cashierName, width - 6), width));
  push(rule('-', width));

  for (const item of receipt.items) {
    const money = formatRupiah(item.subtotal);
    const qty = `${item.qty}x`;
    const name = truncate(item.name, Math.max(1, width - money.length - qty.length - 2));
    push(padLine(`${name} ${qty}`, money, width));
    if (item.note) push(`  ${truncate(item.note, width - 2)}`);
  }

  push(rule('-', width));
  push(padLine('Subtotal', formatRupiah(receipt.subtotal), width));
  push(padLine('Diskon', formatRupiah(receipt.discountAmount), width));
  push(padLine('Pajak', formatRupiah(receipt.taxAmount), width));
  push(padLine('Service', formatRupiah(receipt.serviceAmount), width));
  push(padLine('TOTAL', formatRupiah(receipt.total), width));
  push(rule('-', width));

  for (const payment of receipt.payments) {
    const label = payment.splitGroupId
      ? `${payment.method}#${payment.splitGroupId}`
      : payment.method;
    push(padLine(label, formatRupiah(payment.amount), width));
  }
  if (receipt.change > 0) {
    push(padLine('KEMBALIAN', formatRupiah(receipt.change), width));
  }

  push(rule('-', width));
  if (receipt.eta?.min != null && receipt.eta.max != null) {
    push(center(`Estimasi: ${receipt.eta.min}-${receipt.eta.max} menit`, width));
  }
  if (receipt.receiptFooter) push(center(receipt.receiptFooter, width));
  push(rule('=', width));

  return lines;
}

export interface KitchenSlipInput {
  ticketNumber: string;
  stationCode: string;
  stationName?: string | null;
  at: string;
  items: Array<{ name: string; qty: number; note?: string | null }>;
}

/** Render one station's kitchen slip as fixed-width text lines. */
export function renderKitchenSlip(slip: KitchenSlipInput, width: PaperWidth = 32): string[] {
  const lines: string[] = [];
  const push = (line: string) => lines.push(line.slice(0, width).padEnd(width, ' '));

  push(rule('=', width));
  push(center(`TIKET ${slip.ticketNumber}`, width));
  push(center(`STASIUN ${slip.stationCode}${slip.stationName ? ` - ${slip.stationName}` : ''}`, width));
  push(rule('-', width));
  for (const item of slip.items) {
    push(padLine(truncate(item.name, width - 8), `x${item.qty}`, width));
    if (item.note) push(`  ${truncate(item.note, width - 2)}`);
  }
  push(rule('-', width));
  push(center(slip.at, width));
  push(rule('=', width));

  return lines;
}

/** ESC/POS: initialize, print lines, feed and cut — returned as base64 bytes. */
export function escPosBase64(lines: string[]): string {
  const init = Buffer.from([0x1b, 0x40]);
  const body = Buffer.from(lines.map((line) => `${line}\n`).join(''), 'utf8');
  const cut = Buffer.from([0x1b, 0x64, 0x02, 0x1d, 0x56, 0x42, 0x00]);
  return Buffer.concat([init, body, cut]).toString('base64');
}
