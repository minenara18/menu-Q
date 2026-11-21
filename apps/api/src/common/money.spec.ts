import {
  allocateSplit,
  applyDiscount,
  calcTotals,
  maxPortion,
  roundHalfUp,
  splitRemaining,
  variance,
} from './money';

describe('money (integer rupiah)', () => {
  test('roundHalfUp rounds to nearest, halves up', () => {
    expect(roundHalfUp(1.4)).toBe(1);
    expect(roundHalfUp(1.5)).toBe(2);
    expect(roundHalfUp(1980)).toBe(1980);
  });

  test('calcTotals uses basis-point rates', () => {
    expect(calcTotals(54000, 1100, 500)).toEqual({ tax: 5940, service: 2700, total: 62640 });
    expect(calcTotals(18000, 1100, 500)).toEqual({ tax: 1980, service: 900, total: 20880 });
  });

  test('calcTotals rounds each component half-up', () => {
    // 3 * 1100 / 10000 = 0.33 -> 0; 3 * 500 / 10000 = 0.15 -> 0
    expect(calcTotals(3, 1100, 500)).toEqual({ tax: 0, service: 0, total: 3 });
    // 1 * 1500 / 10000 = 0.15 -> 0
    expect(calcTotals(1, 1500, 0)).toEqual({ tax: 0, service: 0, total: 1 });
    // 5 * 1500 / 10000 = 0.75 -> 1
    expect(calcTotals(5, 1500, 0).tax).toBe(1);
  });

  test('applyDiscount percent is rounded half-up against subtotal+tax+service', () => {
    expect(applyDiscount(18000, 1980, 900, { type: 'percent', value: 10 })).toEqual({
      discountAmount: 2088,
      total: 18792,
    });
  });

  test('applyDiscount amount is capped at the chargeable base', () => {
    expect(applyDiscount(10000, 0, 0, { type: 'amount', value: 50000 })).toEqual({
      discountAmount: 10000,
      total: 0,
    });
    expect(applyDiscount(10000, 0, 0, { type: 'amount', value: 4000 })).toEqual({
      discountAmount: 4000,
      total: 6000,
    });
  });

  test('applyDiscount without discount keeps the base total', () => {
    expect(applyDiscount(18000, 1980, 900)).toEqual({ discountAmount: 0, total: 20880 });
  });

  test.each([
    [100, 3],
    [101, 3],
    [20880, 7],
    [1, 4],
    [999999, 13],
    [0, 5],
  ])('allocateSplit(%i, %i) sums exactly to the total', (total, parts) => {
    const shares = allocateSplit(total, parts);
    expect(shares).toHaveLength(parts);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
    const max = Math.max(...shares);
    const min = Math.min(...shares);
    expect(max - min).toBeLessThanOrEqual(1);
  });

  test('max portion', () => {
    expect(maxPortion(10, 3)).toBe(3);
    expect(maxPortion(2, 3)).toBe(0);
  });

  test('variance', () => {
    expect(variance(100000, 95000)).toBe(5000);
  });

  test('split remaining', () => {
    expect(splitRemaining(60000, [20000, 15000])).toBe(25000);
  });
});
