import { formatIDR } from '../theme/tokens';
import { changeDue, formatEta } from '../utils/cart';
import { newId } from '../utils/id';

describe('format IDR', () => {
  it('formats rupiah with Indonesian separators', () => {
    expect(formatIDR(59400)).toBe('Rp 59.400');
    expect(formatIDR(20880)).toBe('Rp 20.880');
    expect(formatIDR(0)).toBe('Rp 0');
  });

  it('computes change and ETA range text', () => {
    expect(changeDue(59400, 60000)).toBe(600);
    expect(changeDue(59400, 50000)).toBe(0);
    expect(formatEta(6, 10)).toBe('6–10 menit');
    expect(formatEta(null, null)).toBe('Estimasi belum tersedia');
  });

  it('generates v4-shaped UUIDs', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
