import type { CartItem } from '@order-q/shared';

export interface CartLine extends CartItem {
  name: string;
  price: number;
}

export function addLine(lines: CartLine[], line: CartLine): CartLine[] {
  const found = lines.find((l) => l.menuId === line.menuId && (l.note ?? '') === (line.note ?? ''));
  if (!found) return [...lines, line];
  return lines.map((l) =>
    l === found ? { ...l, qty: l.qty + line.qty } : l,
  );
}

export function setQty(lines: CartLine[], menuId: string, qty: number): CartLine[] {
  if (qty <= 0) return lines.filter((l) => l.menuId !== menuId);
  return lines.map((l) => (l.menuId === menuId ? { ...l, qty } : l));
}

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.price * l.qty, 0);
}

export function changeDue(total: number, paid: number): number {
  return Math.max(0, paid - total);
}

export function formatEta(min: number | null | undefined, max: number | null | undefined): string {
  if (min == null || max == null) return 'Estimasi belum tersedia';
  return `${min}–${max} menit`;
}
