-- Additive mobile-readiness fields on Ticket. Existing rows get NULL, which
-- PostgreSQL treats as distinct in a unique index (no historical data change).

ALTER TABLE "Ticket" ADD COLUMN "tableLabel" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "clientTicketId" TEXT;

CREATE UNIQUE INDEX "Ticket_outletId_clientTicketId_key" ON "Ticket"("outletId", "clientTicketId");
CREATE INDEX "Ticket_outletId_clientTicketId_idx" ON "Ticket"("outletId", "clientTicketId");
