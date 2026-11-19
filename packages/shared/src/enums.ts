// Enum values MUST match the Prisma/PostgreSQL enum values (uppercase).
// Do not lowercase these without migrating the database enums too.

export enum UserRole {
  CASHIER = 'CASHIER',
  MAKER = 'MAKER',
  OWNER = 'OWNER',
}

export enum TicketStatus {
  DRAFT = 'DRAFT',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  ORDERED = 'ORDERED',
  IN_PROGRESS = 'IN_PROGRESS',
  READY = 'READY',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum SubTicketStatus {
  ORDERED = 'ORDERED',
  IN_PROGRESS = 'IN_PROGRESS',
  READY = 'READY',
  CANCELLED = 'CANCELLED',
}

export enum OrderType {
  DINE_IN = 'DINE_IN',
  TAKEAWAY = 'TAKEAWAY',
}

export enum PaymentMethod {
  CASH = 'CASH',
  QRIS = 'QRIS',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum StationCode {
  BAR = 'BAR',
  KITCHEN = 'KITCHEN',
  PASTRY = 'PASTRY',
}

export enum StockMoveReason {
  SALE = 'SALE',
  REFUND = 'REFUND',
  OPNAME = 'OPNAME',
  RECEIVE = 'RECEIVE',
  ADJUSTMENT = 'ADJUSTMENT',
  WASTE = 'WASTE',
}

export enum ShiftStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum MenuAvailability {
  AVAILABLE = 'AVAILABLE',
  LOW_STOCK = 'LOW_STOCK',
  UNAVAILABLE = 'UNAVAILABLE',
}
