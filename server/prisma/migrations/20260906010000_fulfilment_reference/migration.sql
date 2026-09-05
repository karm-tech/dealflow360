-- A shipment is a document in its own right, so it needs a reference a person
-- can quote. Added nullable first because existing rows have no value yet.
ALTER TABLE "Fulfilment" ADD COLUMN "reference" TEXT;

UPDATE "Fulfilment"
SET "reference" = 'DF-S-' || substr('0000' || CAST("id" AS TEXT), -4, 4)
WHERE "reference" IS NULL;

CREATE UNIQUE INDEX "Fulfilment_reference_key" ON "Fulfilment"("reference");
