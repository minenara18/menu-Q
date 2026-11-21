-- Money is stored as integer rupiah (amounts) and integer basis points (rates).
-- Existing double-precision values are rounded explicitly, never truncated.

-- AlterTable: Outlet rates (0.11 -> 1100 bps, 0.05 -> 500 bps) and variance threshold.
ALTER TABLE "Outlet" ALTER COLUMN "taxRate" TYPE INTEGER USING round(("taxRate" * 10000)::numeric)::int;
ALTER TABLE "Outlet" ALTER COLUMN "taxRate" SET DEFAULT 1100;
ALTER TABLE "Outlet" ALTER COLUMN "serviceRate" TYPE INTEGER USING round(("serviceRate" * 10000)::numeric)::int;
ALTER TABLE "Outlet" ALTER COLUMN "serviceRate" SET DEFAULT 500;
ALTER TABLE "Outlet" ALTER COLUMN "varianceThreshold" TYPE INTEGER USING round("varianceThreshold"::numeric)::int;
ALTER TABLE "Outlet" ALTER COLUMN "varianceThreshold" SET DEFAULT 10000;

-- AlterTable: Shift cash amounts.
ALTER TABLE "Shift" ALTER COLUMN "openingCash" TYPE INTEGER USING round("openingCash"::numeric)::int;
ALTER TABLE "Shift" ALTER COLUMN "openingCash" SET DEFAULT 0;
ALTER TABLE "Shift" ALTER COLUMN "expectedCash" TYPE INTEGER USING round("expectedCash"::numeric)::int;
ALTER TABLE "Shift" ALTER COLUMN "countedCash" TYPE INTEGER USING round("countedCash"::numeric)::int;
ALTER TABLE "Shift" ALTER COLUMN "variance" TYPE INTEGER USING round("variance"::numeric)::int;
