/**
 * Single source of truth for money math.
 *
 * Representation: all amounts are integer rupiah. Tax/service rates are
 * integer basis points (10000 = 100%, 1100 = 11%). No floating-point money and
 * no Prisma Decimal is used anywhere on the server.
 *
 * Rounding rule: every component is rounded to the nearest rupiah, halves up.
 * Order of computation: subtotal → tax → service → discount. The discount is
 * applied against subtotal + tax + service (the amount actually charged), which
 * preserves the historical totals used by the POS.
 */

/** Round to the nearest integer, halves rounded up. */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(value + 0.5);
}

/**
 * Tax and service from basis-point rates.
 * taxBps = 1100 means 11%; serviceBps = 500 means 5%.
 */
export function calcTotals(subtotal: number, taxBps: number, serviceBps: number) {
  const tax = roundHalfUp((subtotal * taxBps) / 10000);
  const service = roundHalfUp((subtotal * serviceBps) / 10000);
  return { tax, service, total: subtotal + tax + service };
}

export interface DiscountInput {
  type: 'amount' | 'percent';
  value: number;
}

/**
 * Apply a ticket-level discount against subtotal + tax + service.
 * Percent discounts are rounded half-up; amount discounts are capped at the
 * chargeable base. Callers validate the discount range before calling.
 */
export function applyDiscount(
  subtotal: number,
  taxAmount: number,
  serviceAmount: number,
  discount?: DiscountInput,
): { discountAmount: number; total: number } {
  const base = subtotal + taxAmount + serviceAmount;

  let discountAmount = 0;
  if (discount) {
    if (discount.type === 'percent') {
      discountAmount = roundHalfUp((base * discount.value) / 100);
    } else {
      discountAmount = Math.min(roundHalfUp(discount.value), base);
    }
  }

  return { discountAmount, total: base - discountAmount };
}

export function maxPortion(qty: number, per: number) {
  if (per <= 0) return 0;
  return Math.floor(qty / per);
}

export function variance(counted: number, expected: number) {
  return counted - expected;
}

export function splitRemaining(total: number, paid: number[]) {
  return total - paid.reduce((a, b) => a + b, 0);
}

/**
 * Split `total` into `parts` equal integer shares using the largest-remainder
 * method, so the parts always sum exactly to `total` (no lost rupiah).
 */
export function allocateSplit(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const shares = Array.from({ length: parts }, () => base);
  let remainder = total - base * parts;
  for (let i = 0; i < remainder; i++) {
    shares[i] += 1;
  }
  return shares;
}
