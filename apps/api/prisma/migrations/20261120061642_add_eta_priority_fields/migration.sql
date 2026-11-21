-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "defaultMakeSeconds" INTEGER NOT NULL DEFAULT 180;

-- AlterTable
ALTER TABLE "Menu" ADD COLUMN     "makeSampleCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SubTicket" ADD COLUMN     "priorityBump" DOUBLE PRECISION NOT NULL DEFAULT 0;
