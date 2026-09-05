-- Lead time and replenishment days, so the delivery estimate is computed from
-- warehouse data rather than assumed.
ALTER TABLE "Warehouse" ADD COLUMN "leadTimeDays" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Stock" ADD COLUMN "replenishmentDays" INTEGER NOT NULL DEFAULT 14;
