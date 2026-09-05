-- A subscription outlives the order that created it, and a credit note is a
-- document a customer may quote back, so both need their own reference.
-- Added nullable first because existing rows have no value yet.
ALTER TABLE "Subscription" ADD COLUMN "reference" TEXT;

UPDATE "Subscription"
SET "reference" = 'DF-SUB-' || substr('0000' || CAST("id" AS TEXT), -4, 4)
WHERE "reference" IS NULL;

CREATE UNIQUE INDEX "Subscription_reference_key" ON "Subscription"("reference");

ALTER TABLE "CreditNote" ADD COLUMN "number" TEXT;

UPDATE "CreditNote"
SET "number" = 'DF-CN-' || substr('0000' || CAST("id" AS TEXT), -4, 4)
WHERE "number" IS NULL;

CREATE UNIQUE INDEX "CreditNote_number_key" ON "CreditNote"("number");

-- How long a customer has to pay. Configurable rather than fixed in code.
ALTER TABLE "Settings" ADD COLUMN "paymentTermsDays" INTEGER NOT NULL DEFAULT 30;
