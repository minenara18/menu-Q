-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "stationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "User_stationId_idx" ON "User"("stationId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE SET NULL ON UPDATE CASCADE;
