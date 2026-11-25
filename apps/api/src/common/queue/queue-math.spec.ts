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

  describe('ETA range (absolute values in MINUTES)', () => {
    it('station ETA is queue work + new work in seconds', () => {
      expect(estimateStationEtaSeconds(600, 180)).toBe(780);
    });

    it('one 180-second drink in an empty queue yields about 2.4-3.9 minutes', () => {
      const { point, min, max } = estimateTicketEta([180], 0);
      expect(point).toBeCloseTo(3);
      expect(min).toBe(2); // 180 s * 0.8 / 60 = 2.4 -> 2
      expect(max).toBe(4); // 180 s * 1.3 / 60 = 3.9 -> 4
    });

    it('uses the SLOWEST station when items span two stations', () => {
      const { point, min, max } = estimateTicketEta([180, 600], 0);
      expect(point).toBeCloseTo(10);
      expect(min).toBe(8);
      expect(max).toBe(13);
    });

    it('adds real remaining queue work before converting to minutes', () => {
      const { point, min, max } = estimateTicketEta([180 + 180], 1);
      expect(point).toBeCloseTo(6.12); // (360 s * 1.02) / 60
      expect(min).toBe(5);
      expect(max).toBe(8);
    });

    it('applies a capped congestion factor', () => {
      expect(computeDensityFactor(0)).toBe(1);
      expect(computeDensityFactor(10)).toBeCloseTo(1.2);
      expect(computeDensityFactor(1000)).toBeCloseTo(1.25);
      const { point } = estimateTicketEta([600], 10);
      expect(point).toBeCloseTo(12); // 600 s * 1.2 / 60
    });

    it('respects category fallback values (180 s drinks, 600 s food)', () => {
      expect(estimateTicketEta([180], 0).max).toBe(4);
      expect(estimateTicketEta([600], 0).max).toBe(13);
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
