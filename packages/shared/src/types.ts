import { z } from 'zod';
import {
  UserRole,
  TicketStatus,
  SubTicketStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  StationCode,
  StockMoveReason,
  ShiftStatus,
  MenuAvailability,
} from './enums';

// Base entity
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// User
export interface User extends BaseEntity {
  outletId: string;
  name: string;
  pinHash: string;
  role: UserRole;
  isActive: boolean;
  stationId?: string | null;
  stationIds?: string[];
}

export const UserRoleSchema = z.nativeEnum(UserRole);

// Outlet
export interface Outlet extends BaseEntity {
  name: string;
  address?: string;
  phone?: string;
  taxRate: number; // basis points, e.g. 1100 = 11%
  serviceRate: number; // basis points, e.g. 500 = 5%
  currency: string; // IDR
  timezone: string;
  receiptHeader?: string;
  receiptFooter?: string;
}

// Shift
export interface Shift extends BaseEntity {
  outletId: string;
  openedBy: string; // userId
  closedBy?: string;
  openedAt: Date;
  closedAt?: Date;
  openingCash: number;
  expectedCash?: number;
  countedCash?: number;
  variance?: number;
  varianceNote?: string;
  status: ShiftStatus;
}

// Category
export interface Category extends BaseEntity {
  outletId: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  defaultMakeSeconds: number; // fallback make time until a menu has enough samples
}

// Station
export interface Station extends BaseEntity {
  outletId: string;
  code: StationCode;
  name: string;
  displayOrder: number;
  slaMinutes: number; // SLA for this station
  isActive: boolean;
  color: string; // hex color for UI
}

// Menu
export interface Menu extends BaseEntity {
  outletId: string;
  categoryId: string;
  stationId: string;
  name: string;
  description?: string;
  price: number; // in smallest currency unit (cents/rupiah)
  imageUrl?: string;
  displayOrder: number;
  isActive: boolean;
  availability: MenuAvailability;
  avgMakeSeconds: number; // learned average, fallback default
  makeSampleCount: number; // completed subtickets used to learn avgMakeSeconds
  category?: Category;
  station?: Station;
  recipeLines?: RecipeLine[];
}

// Ingredient
export interface Ingredient extends BaseEntity {
  outletId: string;
  name: string;
  unit: string; // e.g., 'g', 'ml', 'pcs'
  currentQty: number;
  minThreshold: number;
  costPerUnit?: number;
}

// Recipe Line (BOM)
export interface RecipeLine extends BaseEntity {
  menuId: string;
  ingredientId: string;
  qtyPerPortion: number;
  ingredient?: Ingredient;
}

// Stock Move
export interface StockMove extends BaseEntity {
  outletId: string;
  ingredientId: string;
  qtyDelta: number; // positive for receive, negative for sale/waste
  reason: StockMoveReason;
  refId?: string; // ticketId, opnameId, etc.
  refType?: string; // 'ticket' | 'opname' | 'receive' | 'adjustment'
  createdBy: string; // userId
  ingredient?: Ingredient;
}

// Ticket
export interface Ticket extends BaseEntity {
  outletId: string;
  shiftId: string;
  dailyNo: number; // sequential per shift
  ticketNumber: string; // formatted: A-043
  customerName?: string;
  orderType: OrderType;
  tableNumber?: string;
  status: TicketStatus;
  etaMin?: number;
  etaMax?: number;
  subtotal: number;
  taxAmount: number;
  serviceAmount: number;
  discountAmount: number;
  totalAmount: number;
  subtickets?: SubTicket[];
  orderItems?: OrderItem[];
  payments?: Payment[];
  shift?: Shift;
}

export const DisplayTokenResponseSchema = z.object({
  token: z.string(),
  tokenType: z.literal('Bearer'),
});
export type DisplayTokenResponse = z.infer<typeof DisplayTokenResponseSchema>;

/** Sanitized payload sent to read-only customer display tokens. */
export interface DisplayTicketEvent {
  ticketNumber: string;
  status: string;
  etaMin: number | null;
  etaMax: number | null;
}

export const TicketNumberSchema = z.string().regex(/^[A-Z]-\d{3,}$/);

// SubTicket (per station)
export interface SubTicket extends BaseEntity {
  ticketId: string;
  stationId: string;
  status: SubTicketStatus;
  startedAt?: Date;
  readyAt?: Date;
  priorityScore: number; // lower = higher priority
  priorityBump: number; // manual maker bumps
  station?: Station;
  ticket?: Ticket;
}

// Order Item
export interface OrderItem extends BaseEntity {
  ticketId: string;
  menuId: string;
  subticketId?: string;
  qty: number;
  priceSnapshot: number; // price at time of order
  note?: string;
  menu?: Menu;
  subticket?: SubTicket;
}

// Payment
export interface Payment extends BaseEntity {
  ticketId: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  splitGroupId?: string;
  qrisRef?: string;
  qrisPayload?: Record<string, unknown>;
  ticket?: Ticket;
}

// Audit Log
export interface AuditLog extends BaseEntity {
  actorId?: string;
  action: string;
  entity: string;
  entityId: string;
  diff?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// Device Outbox (for offline sync)
export interface DeviceOutbox extends BaseEntity {
  deviceId: string;
  payload: Record<string, unknown>;
  seq: number;
  status: 'pending' | 'synced' | 'failed';
  lastAttemptAt?: Date;
  error?: string;
}

// API Contracts
export const LoginRequestSchema = z.object({
  outletId: z.string().uuid(),
  userId: z.string().uuid(),
  pin: z.string().length(6),
});

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    role: UserRoleSchema,
    outletId: z.string().uuid(),
  }),
  shift: z.object({
    id: z.string().uuid(),
    status: z.nativeEnum(ShiftStatus),
    openingCash: z.number(),
  }).nullable(),
});

export const OpenShiftRequestSchema = z.object({
  outletId: z.string().uuid(),
  openingCash: z.number().min(0),
});

export const MenuQuerySchema = z.object({
  station: z.nativeEnum(StationCode).optional(),
  q: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional().default(true),
});

export const MenuItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  price: z.number(),
  imageUrl: z.string().nullable().optional(),
  stationCode: z.nativeEnum(StationCode),
  stationColor: z.string(),
  categoryName: z.string(),
  avgMakeSeconds: z.number(),
  availability: z.nativeEnum(MenuAvailability),
  maxPortion: z.number().optional(),
});

export const MenusResponseSchema = z.array(MenuItemSchema);

export const CartItemSchema = z.object({
  menuId: z.string().uuid(),
  qty: z.number().int().positive(),
  note: z.string().optional(),
});

export const CheckoutPaymentSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  amount: z.number().positive(),
  splitGroupId: z.string().optional(),
});

export const DiscountSchema = z.object({
  type: z.enum(['amount', 'percent']),
  value: z.number().min(0),
}).refine((d) => (d.type === 'percent' ? d.value <= 100 : true), {
  message: 'Discount percent must be <= 100',
});

export const CheckoutRequestSchema = z.object({
  items: z.array(CartItemSchema).min(1),
  customerName: z.string().optional(),
  orderType: z.nativeEnum(OrderType),
  tableNumber: z.string().optional(),
  payments: z.array(CheckoutPaymentSchema).min(1),
  idempotencyKey: z.string().uuid(),
  discount: DiscountSchema.optional(),
});

export const CheckoutResponseSchema = z.object({
  ticket: z.object({
    id: z.string().uuid(),
    ticketNumber: z.string(),
    status: z.nativeEnum(TicketStatus),
    etaMin: z.number(),
    etaMax: z.number(),
    totalAmount: z.number(),
    subtickets: z.array(z.object({
      id: z.string().uuid(),
      stationCode: z.nativeEnum(StationCode),
      stationName: z.string(),
      status: z.nativeEnum(SubTicketStatus),
    })),
  }),
  receipt: z.object({
    outletName: z.string(),
    ticketNumber: z.string(),
    items: z.array(z.object({
      name: z.string(),
      qty: z.number(),
      price: z.number(),
      subtotal: z.number(),
    })),
    subtotal: z.number(),
    taxAmount: z.number(),
    serviceAmount: z.number(),
    discountAmount: z.number(),
    total: z.number(),
    payments: z.array(z.object({
      method: z.nativeEnum(PaymentMethod),
      amount: z.number(),
    })),
    change: z.number().optional(),
    timestamp: z.string().datetime(),
  }),
});

export const TicketQuerySchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
  station: z.nativeEnum(StationCode).optional(),
  q: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const SubTicketStatusUpdateSchema = z.object({
  status: z.nativeEnum(SubTicketStatus).refine(v => v !== SubTicketStatus.CANCELLED, {
    message: 'Use ticket cancellation endpoint for cancelled',
  }),
});

export const TicketStatusUpdateSchema = z.object({
  status: z.nativeEnum(TicketStatus).refine(
    v => [TicketStatus.COMPLETED, TicketStatus.CANCELLED].includes(v),
    { message: 'Only completed or cancelled allowed at ticket level' }
  ),
});

export const CancelTicketRequestSchema = z.object({
  managerPin: z.string().length(6),
  reason: z.string().min(1).max(200),
});

// Socket Events
export interface SocketEvents {
  'ticket:created': TicketCreatedEvent;
  'ticket:updated': TicketUpdatedEvent;
  'ticket:eta-updated': TicketEtaUpdatedEvent;
  'subticket:updated': SubTicketUpdatedEvent;
  'ticket:ready': TicketReadyEvent;
  'station:queue-updated': StationQueueUpdatedEvent;
  'stock:changed': StockChangedEvent;
  'shift:closed': ShiftClosedEvent;
  'printer:status': PrinterStatusEvent;
}

export interface TicketCreatedEvent {
  ticket: Ticket;
  subtickets: SubTicket[];
}

export interface TicketUpdatedEvent {
  ticketId: string;
  status: TicketStatus;
  updatedFields: Partial<Ticket>;
}

export interface SubTicketUpdatedEvent {
  subticketId: string;
  ticketId: string;
  stationId: string;
  status: SubTicketStatus;
  startedAt?: Date;
  readyAt?: Date;
}

export interface TicketReadyEvent {
  ticketId: string;
  ticketNumber: string;
  customerName?: string;
  orderType: OrderType;
}

export interface TicketEtaUpdatedEvent {
  ticketId: string;
  ticketNumber: string;
  etaMin: number;
  etaMax: number;
}

export interface StationQueueUpdatedEvent {
  outletId: string;
  stationId?: string;
  subticketId?: string;
  ticketId?: string;
  reason: 'TICKET_CREATED' | 'SUBTICKET_READY' | 'PRIORITY_BUMP';
}

export interface StockChangedEvent {
  outletId: string;
  reason: StockMoveReason | 'MENU_TOGGLE';
  ticketId?: string;
  menuIds?: string[];
  changes: Array<{ ingredientId: string; qtyDelta: number }>;
  at: string;
}

export interface ShiftClosedEvent {
  shiftId: string;
  closedAt: Date;
  variance: number;
}

export interface PrinterStatusEvent {
  deviceId: string;
  status: 'connected' | 'disconnected' | 'error';
  message?: string;
}

// Type exports for convenience
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type OpenShiftRequest = z.infer<typeof OpenShiftRequestSchema>;
export type MenuQuery = z.infer<typeof MenuQuerySchema>;
export type MenuItem = z.infer<typeof MenuItemSchema>;
export type CartItem = z.infer<typeof CartItemSchema>;
export type Discount = z.infer<typeof DiscountSchema>;
export type CheckoutPayment = z.infer<typeof CheckoutPaymentSchema>;
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;
export type TicketQuery = z.infer<typeof TicketQuerySchema>;
export type SubTicketStatusUpdate = z.infer<typeof SubTicketStatusUpdateSchema>;
export type TicketStatusUpdate = z.infer<typeof TicketStatusUpdateSchema>;
export type CancelTicketRequest = z.infer<typeof CancelTicketRequestSchema>;