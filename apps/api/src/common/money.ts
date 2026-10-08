export function calcTotals(subtotal: number, taxRate: number, serviceRate: number) {
  const tax = Math.round(subtotal * taxRate);
  const service = Math.round(subtotal * serviceRate);
  return { tax, service, total: subtotal + tax + service };
}
export function maxPortion(qty: number, per: number) {
  if (per <= 0) return 0;
  return Math.floor(qty / per);
}
export function variance(counted: number, expected: number) { return counted - expected; }
export function splitRemaining(total: number, paid: number[]) {
  return total - paid.reduce((a, b) => a + b, 0);
}
