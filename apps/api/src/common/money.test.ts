import { calcTotals, maxPortion, variance, splitRemaining } from './money.spec';

describe('fase2 unit', () => {
  test('total pajak+service', () => {
    expect(calcTotals(54000, 0.11, 0.05)).toEqual({ tax: 5940, service: 2700, total: 62640 });
  });
  test('max portion', () => {
    expect(maxPortion(300, 150)).toBe(2);
    expect(maxPortion(0, 10)).toBe(0);
  });
  test('variance', () => { expect(variance(100000, 95000)).toBe(5000); });
  test('split remaining', () => { expect(splitRemaining(60000, [20000, 15000])).toBe(25000); });
});
