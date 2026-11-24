-- Additive: many-to-many user/station relation. Existing User.stationId is kept
-- for compatibility; its values are copied into the join table.
CREATE TABLE "UserStation" (
    "userId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId","stationId")
);

INSERT INTO "UserStation" ("userId", "stationId", "createdAt")
SELECT "id", "stationId", CURRENT_TIMESTAMP
FROM "User"
WHERE "stationId" IS NOT NULL
ON CONFLICT ("userId", "stationId") DO NOTHING;

ALTER TABLE "UserStation" ADD CONSTRAINT "UserStation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserStation" ADD CONSTRAINT "UserStation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "UserStation_stationId_idx" ON "UserStation"("stationId");
