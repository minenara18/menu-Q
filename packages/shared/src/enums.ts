export enum UserRole {
  CASHIER = 'cashier',
  MAKER = 'maker',
  OWNER = 'owner',
}

export enum TicketStatus {
  DRAFT = 'draft',
  PENDING_PAYMENT = 'pending_payment',
  ORDERED = 'ordered',
  IN_PROGRESS = 'in_progress',
  READY = 'ready',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum SubTicketStatus {
  ORDERED = 'ordered',
  IN_PROGRESS = 'in_progress',
  READY = 'ready',
  CANCELLED = 'cancelled',
}

export enum OrderType {
  DINE_IN = 'dine_in',
  TAKEAWAY = 'takeaway',
}

export enum PaymentMethod {
  CASH = 'cash',
  QRIS = 'qris',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum StationCode {
  BAR = 'BAR',
  KITCHEN = 'KITCHEN',
  PASTRY = 'PASTRY',
}

export enum StockMoveReason {
  SALE = 'sale',
  REFUND = 'refund',
  OPNAME = 'opname',
  RECEIVE = 'receive',
  ADJUSTMENT = 'adjustment',
  WASTE = 'waste',
}

export enum ShiftStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

export enum MenuAvailability {
  AVAILABLE = 'available',
  LOW_STOCK = 'low_stock',
  UNAVAILABLE = 'unavailable',
}