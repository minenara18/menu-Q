/**
 * Single source of truth for money math.
 *
 * Representation: all amounts are integer rupiah. Tax/service rates are
 * integer basis points (10000 = 100%, 1100 = 11%). No floating-point money and
 * no Prisma Decimal is used anywhere on the server.
 *
 * Rounding rule (order matters): DISCOUNT → SERVICE → TAX.
 *   1. discount  = roundHalfUp(subtotal × percent)  (amount discounts are capped at subtotal)
 *   2. basis     = subtotal - discount
 *   3. service   = roundHalfUp(basis × serviceBps / 10000)
 *   4. tax       = roundHalfUp((basis + service) × taxBps / 10000)
 *   5. total     = basis + service + tax
 * Every component is rounded to the nearest rupiah, halves rounded up.
 */

/** Round to the nearest integer, halves rounded up. */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(value + 0.5);
}

export interface DiscountInput {
  type: 'amount' | 'percent';
  value: number;
}

/** Apply a ticket-level discount against the subtotal. */
export function applyDiscount(
  subtotal: number,
  discount?: DiscountInput,
): { discountAmount: number; afterDiscount: number } {
  let discountAmount = 0;
  if (discount) {
    if (discount.type === 'percent') {
      discountAmount = roundHalfUp((subtotal * discount.value) / 100);
    } else {
      discountAmount = Math.min(roundHalfUp(discount.value), subtotal);
    }
  }
  return { discountAmount, afterDiscount: subtotal - discountAmount };
}

/** Compute discount, service, tax and total in the documented order. */
export function calcTotals(
  subtotal: number,
  taxBps: number,
  serviceBps: number,
  discount?: DiscountInput,
) {
  const { discountAmount, afterDiscount } = applyDiscount(subtotal, discount);
  const service = roundHalfUp((afterDiscount * serviceBps) / 10000);
  const tax = roundHalfUp(((afterDiscount + service) * taxBps) / 10000);
  return {
    discountAmount,
    afterDiscount,
    service,
    tax,
    total: afterDiscount + service + tax,
  };
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
