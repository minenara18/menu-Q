-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CASHIER', 'MAKER', 'OWNER');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'ORDERED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubTicketStatus" AS ENUM ('ORDERED', 'IN_PROGRESS', 'READY', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKEAWAY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'QRIS');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "StationCode" AS ENUM ('BAR', 'KITCHEN', 'PASTRY');

-- CreateEnum
CREATE TYPE "StockMoveReason" AS ENUM ('SALE', 'REFUND', 'OPNAME', 'RECEIVE', 'ADJUSTMENT', 'WASTE');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MenuAvailability" AS ENUM ('AVAILABLE', 'LOW_STOCK', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "Outlet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0.11,
    "serviceRate" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "receiptHeader" TEXT,
    "receiptFooter" TEXT,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "varianceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "partialReadyPolicy" TEXT NOT NULL DEFAULT 'WAIT_ALL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "closedBy" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedCash" DOUBLE PRECISION,
    "countedCash" DOUBLE PRECISION,
    "variance" DOUBLE PRECISION,
    "varianceNote" TEXT,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "code" "StationCode" NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "slaMinutes" INTEGER NOT NULL DEFAULT 15,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL DEFAULT '#2563EB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "availability" "MenuAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "avgMakeSeconds" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "currentQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costPerUnit" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeLine" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qtyPerPortion" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMove" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qtyDelta" DOUBLE PRECISION NOT NULL,
    "reason" "StockMoveReason" NOT NULL,
    "refId" TEXT,
    "refType" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "dailyNo" INTEGER NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "customerName" TEXT,
    "orderType" "OrderType" NOT NULL,
    "tableNumber" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'DRAFT',
    "etaMin" INTEGER,
    "etaMax" INTEGER,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "serviceAmount" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubTicket" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "status" "SubTicketStatus" NOT NULL DEFAULT 'ORDERED',
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "priorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "subticketId" TEXT,
    "qty" INTEGER NOT NULL,
    "priceSnapshot" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "splitGroupId" TEXT,
    "qrisRef" TEXT,
    "qrisPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashCount" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "denomination" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diff" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceOutbox" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "seq" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastAttemptAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutletSetting" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutletSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Outlet_name_idx" ON "Outlet"("name");

-- CreateIndex
CREATE INDEX "User_outletId_idx" ON "User"("outletId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "User_outletId_name_key" ON "User"("outletId", "name");

-- CreateIndex
CREATE INDEX "Shift_outletId_status_idx" ON "Shift"("outletId", "status");

-- CreateIndex
CREATE INDEX "Shift_openedAt_idx" ON "Shift"("openedAt");

-- CreateIndex
CREATE INDEX "Category_outletId_displayOrder_idx" ON "Category"("outletId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Category_outletId_name_key" ON "Category"("outletId", "name");

-- CreateIndex
CREATE INDEX "Station_outletId_displayOrder_idx" ON "Station"("outletId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Station_outletId_code_key" ON "Station"("outletId", "code");

-- CreateIndex
CREATE INDEX "Menu_outletId_isActive_stationId_idx" ON "Menu"("outletId", "isActive", "stationId");

-- CreateIndex
CREATE INDEX "Menu_categoryId_idx" ON "Menu"("categoryId");

-- CreateIndex
CREATE INDEX "Menu_stationId_idx" ON "Menu"("stationId");

-- CreateIndex
CREATE INDEX "Ingredient_outletId_idx" ON "Ingredient"("outletId");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_outletId_name_key" ON "Ingredient"("outletId", "name");

-- CreateIndex
CREATE INDEX "RecipeLine_menuId_idx" ON "RecipeLine"("menuId");

-- CreateIndex
CREATE INDEX "RecipeLine_ingredientId_idx" ON "RecipeLine"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeLine_menuId_ingredientId_key" ON "RecipeLine"("menuId", "ingredientId");

-- CreateIndex
CREATE INDEX "StockMove_outletId_ingredientId_createdAt_idx" ON "StockMove"("outletId", "ingredientId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMove_refId_refType_idx" ON "StockMove"("refId", "refType");

-- CreateIndex
CREATE INDEX "StockMove_reason_idx" ON "StockMove"("reason");

-- CreateIndex
CREATE INDEX "Ticket_outletId_shiftId_status_idx" ON "Ticket"("outletId", "shiftId", "status");

-- CreateIndex
CREATE INDEX "Ticket_outletId_createdAt_idx" ON "Ticket"("outletId", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_dailyNo_idx" ON "Ticket"("dailyNo");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_shiftId_dailyNo_key" ON "Ticket"("shiftId", "dailyNo");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_ticketNumber_shiftId_key" ON "Ticket"("ticketNumber", "shiftId");

-- CreateIndex
CREATE INDEX "SubTicket_ticketId_idx" ON "SubTicket"("ticketId");

-- CreateIndex
CREATE INDEX "SubTicket_stationId_status_idx" ON "SubTicket"("stationId", "status");

-- CreateIndex
CREATE INDEX "SubTicket_stationId_priorityScore_idx" ON "SubTicket"("stationId", "priorityScore");

-- CreateIndex
CREATE INDEX "OrderItem_ticketId_idx" ON "OrderItem"("ticketId");

-- CreateIndex
CREATE INDEX "OrderItem_menuId_idx" ON "OrderItem"("menuId");

-- CreateIndex
CREATE INDEX "OrderItem_subticketId_idx" ON "OrderItem"("subticketId");

-- CreateIndex
CREATE INDEX "Payment_ticketId_idx" ON "Payment"("ticketId");

-- CreateIndex
CREATE INDEX "Payment_qrisRef_idx" ON "Payment"("qrisRef");

-- CreateIndex
CREATE INDEX "Payment_splitGroupId_idx" ON "Payment"("splitGroupId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CashCount_shiftId_denomination_key" ON "CashCount"("shiftId", "denomination");

-- CreateIndex
CREATE INDEX "AuditLog_outletId_entity_entityId_idx" ON "AuditLog"("outletId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_outletId_createdAt_idx" ON "AuditLog"("outletId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "DeviceOutbox_outletId_status_idx" ON "DeviceOutbox"("outletId", "status");

-- CreateIndex
CREATE INDEX "DeviceOutbox_deviceId_idx" ON "DeviceOutbox"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceOutbox_deviceId_seq_key" ON "DeviceOutbox"("deviceId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "OutletSetting_outletId_key" ON "OutletSetting"("outletId");

-- CreateIndex
CREATE UNIQUE INDEX "OutletSetting_outletId_key_key" ON "OutletSetting"("outletId", "key");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_openedBy_fkey" FOREIGN KEY ("openedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubTicket" ADD CONSTRAINT "SubTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubTicket" ADD CONSTRAINT "SubTicket_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_subticketId_fkey" FOREIGN KEY ("subticketId") REFERENCES "SubTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceOutbox" ADD CONSTRAINT "DeviceOutbox_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletSetting" ADD CONSTRAINT "OutletSetting_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
