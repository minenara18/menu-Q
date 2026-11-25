import { create } from 'zustand';
import { addLine, cartSubtotal, setQty, type CartLine } from '../utils/cart';

interface CartState {
  lines: CartLine[];
  add: (line: CartLine) => void;
  updateQty: (menuId: string, qty: number) => void;
  clear: () => void;
  subtotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  add: (line) => set((state) => ({ lines: addLine(state.lines, line) })),
  updateQty: (menuId, qty) => set((state) => ({ lines: setQty(state.lines, menuId, qty) })),
  clear: () => set({ lines: [] }),
  subtotal: () => cartSubtotal(get().lines),
}));
