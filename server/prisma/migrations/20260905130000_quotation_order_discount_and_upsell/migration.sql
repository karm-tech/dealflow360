-- Order-level discount and dismissed suggestions on the quotation.
ALTER TABLE "Quotation" ADD COLUMN "orderDiscountPct" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Quotation" ADD COLUMN "dismissedUpsellIds" TEXT;

-- Floor for suggestion margins.
ALTER TABLE "Settings" ADD COLUMN "minUpsellMarginPct" REAL NOT NULL DEFAULT 20;
