import { useCartStore } from '../stores/cart';
import { addLine, cartSubtotal, setQty, type CartLine } from '../utils/cart';

const line = (id: string, price: number, qty = 1, note = ''): CartLine => ({
  menuId: id,
  qty,
  note,
  name: `Menu ${id}`,
  price,
});

describe('cart store', () => {
  beforeEach(() => useCartStore.getState().clear());

  it('merges the same menu+note and increments qty', () => {
    const state = useCartStore.getState();
    state.add(line('a', 10000));
    state.add(line('a', 10000, 2));
    expect(useCartStore.getState().lines).toHaveLength(1);
    expect(useCartStore.getState().lines[0].qty).toBe(3);
    expect(cartSubtotal(useCartStore.getState().lines)).toBe(30000);
  });

  it('keeps items with different notes separate', () => {
    const lines = addLine(addLine([], line('a', 10000, 1, 'panas')), line('a', 10000, 1, 'dingin'));
    expect(lines).toHaveLength(2);
  });

  it('removes a line when qty drops to zero', () => {
    const lines = setQty([line('a', 10000)], 'a', 0);
    expect(lines).toHaveLength(0);
  });

  it('clears after checkout', () => {
    useCartStore.getState().add(line('a', 10000));
    useCartStore.getState().clear();
    expect(useCartStore.getState().lines).toHaveLength(0);
  });
});
