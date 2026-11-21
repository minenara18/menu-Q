import {
  computeDensityFactor,
  computePriorityScore,
  estimateStationEtaSeconds,
  estimateTicketEta,
  nextEma,
  orderQueue,
  resolveAvgMakeSeconds,
  roundHalfUp,
  shouldUseFallback,
} from './queue-math';

describe('queue-math (pure ETA & priority)', () => {
  describe('roundHalfUp', () => {
    it('rounds to nearest, halves up', () => {
      expect(roundHalfUp(1.4)).toBe(1);
      expect(roundHalfUp(1.5)).toBe(2);
      expect(roundHalfUp(2088.0)).toBe(2088);
    });
  });

  describe('EMA learning', () => {
    it('uses the first sample directly', () => {
      expect(nextEma(180, 600, 0)).toBe(600);
    });

    it('blends later samples with the previous average', () => {
      const first = nextEma(180, 600, 0);
      const second = nextEma(first, 300, 1);
      expect(second).toBeCloseTo(first * 0.7 + 300 * 0.3);
    });
  });

  describe('fallback', () => {
    it('uses the category fallback until MIN_SAMPLE_COUNT samples', () => {
      expect(shouldUseFallback(4)).toBe(true);
      expect(shouldUseFallback(5)).toBe(false);
      expect(resolveAvgMakeSeconds(999, 4, 180)).toBe(180);
      expect(resolveAvgMakeSeconds(999, 5, 180)).toBe(999);
    });
  });

  describe('ETA range', () => {
    it('station ETA is queue work + new work', () => {
      expect(estimateStationEtaSeconds(600, 180)).toBe(780);
    });

    it('ticket ETA is the slowest station, shown as a -20%/+30% range', () => {
      const { point, min, max } = estimateTicketEta([600, 780, 300], 0);
      expect(point).toBe(780);
      expect(min).toBe(624); // 780 * 0.8
      expect(max).toBe(1014); // 780 * 1.3
    });

    it('applies a capped congestion factor', () => {
      expect(computeDensityFactor(0)).toBe(1);
      expect(computeDensityFactor(10)).toBeCloseTo(1.2);
      expect(computeDensityFactor(1000)).toBeCloseTo(1.25);
      const { point } = estimateTicketEta([600], 10);
      expect(point).toBeCloseTo(720);
    });
  });

  describe('priority score', () => {
    const base = 1_000_000;

    it('is FIFO while within SLA', () => {
      const result = computePriorityScore({ createdAtMs: base, slaSeconds: 600, nowMs: base + 60_000, priorityBump: 0 });
      expect(result.reason).toBe('FIFO');
      expect(result.score).toBe(base);
    });

    it('jumps ahead once the SLA is breached', () => {
      const result = computePriorityScore({ createdAtMs: base, slaSeconds: 60, nowMs: base + 120_000, priorityBump: 0 });
      expect(result.reason).toBe('melewati SLA');
      expect(result.overdueSeconds).toBe(60);
      expect(result.score).toBe(base - 60_000);
    });

    it('manual bump beats FIFO and SLA', () => {
      const result = computePriorityScore({ createdAtMs: base, slaSeconds: 60, nowMs: base + 120_000, priorityBump: 1 });
      expect(result.reason).toBe('bump manual');
      expect(result.score).toBeLessThan(base - 60_000);
    });

    it('orders the queue transparently', () => {
      const now = 2_000_000;
      const ranked = orderQueue(
        [
          { id: 'old', stationId: 'BAR', createdAtMs: 1_000_000, slaSeconds: 60, priorityBump: 0 },
          { id: 'new', stationId: 'BAR', createdAtMs: 1_900_000, slaSeconds: 60, priorityBump: 0 },
          { id: 'bumped', stationId: 'BAR', createdAtMs: 1_950_000, slaSeconds: 60, priorityBump: 1 },
        ],
        now,
      );
      expect(ranked.map((r) => r.entry.id)).toEqual(['bumped', 'old', 'new']);
      expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
      expect(ranked[1].reason).toBe('melewati SLA');
    });
  });
});
