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

  test('calcTotals applies service then tax on the after-discount basis', () => {
    // No discount: 54000 + 2700 service + 11% of 56700 = 6237 tax.
    expect(calcTotals(54000, 1100, 500)).toEqual({
      discountAmount: 0,
      afterDiscount: 54000,
      service: 2700,
      tax: 6237,
      total: 62937,
    });
    // 18000 + 900 + 11% of 18900 (2079) = 20979.
    expect(calcTotals(18000, 1100, 500)).toEqual({
      discountAmount: 0,
      afterDiscount: 18000,
      service: 900,
      tax: 2079,
      total: 20979,
    });
  });

  test('discount → service → tax, half-up per component', () => {
    // 10% of 18000 = 1800; service 5% of 16200 = 810; tax 11% of 17010 = 1871.
    expect(calcTotals(18000, 1100, 500, { type: 'percent', value: 10 })).toEqual({
      discountAmount: 1800,
      afterDiscount: 16200,
      service: 810,
      tax: 1871,
      total: 18881,
    });
  });

  test('calcTotals rounds each component half-up', () => {
    expect(calcTotals(3, 1100, 500).total).toBe(3);
    expect(calcTotals(5, 1500, 0).tax).toBe(1); // 5 * 15% = 0.75 -> 1
  });

  test('applyDiscount percent is rounded half-up against subtotal', () => {
    expect(applyDiscount(18000, { type: 'percent', value: 10 })).toEqual({
      discountAmount: 1800,
      afterDiscount: 16200,
    });
  });

  test('applyDiscount amount is capped at the subtotal', () => {
    expect(applyDiscount(10000, { type: 'amount', value: 50000 })).toEqual({
      discountAmount: 10000,
      afterDiscount: 0,
    });
    expect(applyDiscount(10000, { type: 'amount', value: 4000 })).toEqual({
      discountAmount: 4000,
      afterDiscount: 6000,
    });
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
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
  });

  test('max portion', () => {
    expect(maxPortion(10, 3)).toBe(3);
  });

  test('variance', () => {
    expect(variance(100000, 95000)).toBe(5000);
  });

  test('split remaining', () => {
    expect(splitRemaining(60000, [20000, 15000])).toBe(25000);
  });
});
