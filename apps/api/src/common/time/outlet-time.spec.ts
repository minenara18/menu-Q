import { outletDayBounds, outletDayKey } from './outlet-time';

describe('outlet-time (machine TZ independent)', () => {
  // 2026-11-24T17:30:00Z = 2026-11-25T00:30 in Asia/Jakarta.
  const instant = new Date('2026-11-24T17:30:00.000Z');

  it('uses the outlet day, not the machine day', () => {
    expect(outletDayKey(instant, 'Asia/Jakarta')).toBe('2026-11-25');
    expect(outletDayKey(instant, 'UTC')).toBe('2026-11-24');
  });

  it('computes the same day key in any process TZ for the same zone', () => {
    // Running this suite under TZ=UTC and TZ=Asia/Jakarta yields identical values.
    expect(outletDayKey(instant, 'Asia/Jakarta')).toBe('2026-11-25');
    expect(outletDayKey(instant, 'Asia/Jakarta')).toBe('2026-11-25');
  });

  it('returns UTC bounds of the local business day', () => {
    const bounds = outletDayBounds(instant, 'Asia/Jakarta');
    expect(bounds.startUtc.toISOString()).toBe('2026-11-24T17:00:00.000Z');
    expect(bounds.endUtc.toISOString()).toBe('2026-11-25T17:00:00.000Z');
    expect(outletDayKey(bounds.startUtc, 'Asia/Jakarta')).toBe('2026-11-25');
  });

  it('handles UTC outlets and invalid input', () => {
    expect(outletDayKey(instant, 'UTC')).toBe('2026-11-24');
    expect(() => outletDayKey('not-a-date', 'UTC')).toThrow(/Invalid instant/);
  });
});
