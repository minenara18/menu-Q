-- Additive: short outlet code for device setup and single-use display pairing codes.

ALTER TABLE "Outlet" ADD COLUMN "code" TEXT;
UPDATE "Outlet" SET "code" = upper(substr(md5("id"), 1, 6)) WHERE "code" IS NULL;
CREATE UNIQUE INDEX "Outlet_code_key" ON "Outlet"("code");

CREATE TABLE "DisplayPairCode" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DisplayPairCode_codeHash_key" ON "DisplayPairCode"("codeHash");
CREATE INDEX "DisplayPairCode_outletId_idx" ON "DisplayPairCode"("outletId");
