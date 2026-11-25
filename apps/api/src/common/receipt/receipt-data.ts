import { outletDayKey } from '../time/outlet-time';

/**
 * One canonical receipt data builder. Both checkout responses and the
 * GET /tickets/:id/receipt endpoint use this function, so there is only one
 * source of truth for receipt data.
 */
export interface ReceiptDataItem {
  name: string;
  qty: number;
  price: number;
  subtotal: number;
  note?: string | null;
}

export interface ReceiptDataPayment {
  method: string;
  amount: number;
  splitGroupId?: string | null;
}

export interface ReceiptData {
  outletName: string;
  outletAddress?: string | null;
  outletPhone?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  currency: string;
  ticketNumber: string;
  date: string;
  /** YYYY-MM-DD in the outlet's time zone. */
  businessDate: string;
  timestamp: string;
  cashier: { id: string; name: string } | null;
  orderType?: string;
  tableNumber?: string | null;
  tableLabel?: string | null;
  customerName?: string | null;
  items: ReceiptDataItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  serviceAmount: number;
  total: number;
  payments: ReceiptDataPayment[];
  change: number;
  eta: { min: number | null; max: number | null };
}

interface IncludedTicket {
  ticketNumber: string;
  createdAt: Date | string;
  customerName?: string | null;
  orderType?: string;
  tableNumber?: string | null;
  tableLabel?: string | null;
  subtotal: number;
  taxAmount: number;
  serviceAmount: number;
  discountAmount: number;
  totalAmount: number;
  etaMin?: number | null;
  etaMax?: number | null;
  orderItems?: Array<{
    qty: number;
    note?: string | null;
    priceSnapshot: number;
    menu?: { name: string } | null;
  }>;
  payments?: Array<{
    method: string;
    amount: number;
    splitGroupId?: string | null;
  }>;
  shift?: {
    openedByUser?: { id: string; name: string } | null;
    outlet?: {
      name: string;
      address?: string | null;
      phone?: string | null;
      receiptHeader?: string | null;
      receiptFooter?: string | null;
      currency?: string;
      timezone?: string;
    } | null;
  } | null;
}

export function buildReceiptData(ticket: IncludedTicket): ReceiptData {
  const outlet = ticket.shift?.outlet;
  const payments = (ticket.payments ?? []).map((p) => ({
    method: p.method,
    amount: p.amount,
    splitGroupId: p.splitGroupId ?? null,
  }));

  const cashTotal = payments
    .filter((p) => p.method === 'CASH')
    .reduce((sum, p) => sum + p.amount, 0);
  const change = Math.max(0, cashTotal - ticket.totalAmount);

  const date = new Date(ticket.createdAt).toISOString();

  return {
    outletName: outlet?.name ?? 'Order-Q',
    outletAddress: outlet?.address ?? null,
    outletPhone: outlet?.phone ?? null,
    receiptHeader: outlet?.receiptHeader ?? null,
    receiptFooter: outlet?.receiptFooter ?? null,
    currency: outlet?.currency ?? 'IDR',
    ticketNumber: ticket.ticketNumber,
    date,
    businessDate: outletDayKey(date, outlet?.timezone ?? 'Asia/Jakarta'),
    timestamp: date,
    cashier: ticket.shift?.openedByUser
      ? { id: ticket.shift.openedByUser.id, name: ticket.shift.openedByUser.name }
      : null,
    orderType: ticket.orderType,
    tableNumber: ticket.tableNumber ?? null,
    tableLabel: ticket.tableLabel ?? ticket.tableNumber ?? null,
    customerName: ticket.customerName ?? null,
    items: (ticket.orderItems ?? []).map((oi) => ({
      name: oi.menu?.name ?? 'Item',
      qty: oi.qty,
      price: oi.priceSnapshot,
      subtotal: oi.priceSnapshot * oi.qty,
      note: oi.note ?? null,
    })),
    subtotal: ticket.subtotal,
    discountAmount: ticket.discountAmount,
    taxAmount: ticket.taxAmount,
    serviceAmount: ticket.serviceAmount,
    total: ticket.totalAmount,
    payments,
    change,
    eta: { min: ticket.etaMin ?? null, max: ticket.etaMax ?? null },
  };
}
