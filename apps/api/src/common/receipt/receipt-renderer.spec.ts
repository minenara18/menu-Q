import {
  center,
  escPosBase64,
  formatRupiah,
  padLine,
  renderKitchenSlip,
  renderReceiptText,
  truncate,
} from './receipt-renderer';
import type { ReceiptRenderInput } from './receipt-renderer';

const receipt: ReceiptRenderInput = {
  outletName: 'Kopi Senja Demo',
  receiptHeader: 'Terima kasih',
  receiptFooter: 'Simpan struk ini',
  ticketNumber: 'A-001',
  date: '2026-11-20T14:03:00.000Z',
  cashierName: 'Adi',
  items: [
    {
      name: 'Kopi Susu dengan nama yang sangat panjang sekali',
      qty: 2,
      subtotal: 36000,
      note: 'Less sugar, extra hot',
    },
  ],
  subtotal: 36000,
  discountAmount: 2088,
  taxAmount: 3960,
  serviceAmount: 1800,
  total: 39672,
  payments: [
    { method: 'CASH', amount: 10000, splitGroupId: 'grp-1' },
    { method: 'QRIS', amount: 29672, splitGroupId: 'grp-1' },
  ],
  change: 0,
  eta: { min: 6, max: 10 },
};

describe('receipt renderer (pure)', () => {
  it('formats rupiah with thousand separators', () => {
    expect(formatRupiah(20880)).toBe('Rp 20.880');
    expect(formatRupiah(0)).toBe('Rp 0');
  });

  it('truncates long names to the available columns', () => {
    expect(truncate('Kopi Susu', 5)).toBe('Kop..');
    expect(truncate('Kopi', 10)).toBe('Kopi');
  });

  it('right-aligns money inside the requested width', () => {
    const line = padLine('TOTAL', 'Rp 20.880', 32);
    expect(line).toHaveLength(32);
    expect(line.endsWith('Rp 20.880')).toBe(true);
    expect(center('A-001', 48)).toHaveLength(48);
  });

  it.each([32, 48] as const)('renders every line at exactly %i columns', (width) => {
    const lines = renderReceiptText(receipt, width);
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) {
      expect(line).toHaveLength(width);
    }
    const joined = lines.join('\n');
    expect(joined).toContain('A-001');
    expect(joined).toContain('TOTAL');
  });

  it('renders split payments and change', () => {
    const lines = renderReceiptText({ ...receipt, change: 328 }, 48);
    const joined = lines.join('\n');
    expect(joined).toContain('CASH#grp-1');
    expect(joined).toContain('QRIS#grp-1');
    expect(joined).toContain('Rp 328');
  });

  it('renders a kitchen slip with ticket, station, notes and time', () => {
    const lines = renderKitchenSlip(
      {
        ticketNumber: 'A-001',
        stationCode: 'BAR',
        stationName: 'Bar',
        at: '20/11/2026 14:03',
        items: [{ name: 'Americano', qty: 1, note: 'Tanpa gula' }],
      },
      32,
    );
    const joined = lines.join('\n');
    expect(lines.every((line) => line.length === 32)).toBe(true);
    expect(joined).toContain('TIKET A-001');
    expect(joined).toContain('BAR');
    expect(joined).toContain('Tanpa gula');
    expect(joined).toContain('20/11/2026 14:03');
  });

  it('encodes ESC/POS bytes (init + cut) as base64', () => {
    const bytes = Buffer.from(escPosBase64(['A-001']), 'base64');
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
    expect(bytes.slice(-7)).toEqual(Buffer.from([0x1b, 0x64, 0x02, 0x1d, 0x56, 0x42, 0x00]));
    expect(bytes.toString('utf8')).toContain('A-001');
  });
});
