-- Catalogue copy, and the chosen variant captured onto the line.
ALTER TABLE "Product" ADD COLUMN "description" TEXT;

PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QuotationLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quotationId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" REAL NOT NULL,
    "discountPct" REAL NOT NULL DEFAULT 0,
    "billingType" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "planId" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "renewalLeadDays" INTEGER,
    CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuotationLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QuotationLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "QuotationLine_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RecurringPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_QuotationLine" ("id", "quotationId", "productId", "qty", "unitPrice", "discountPct", "billingType", "planId", "startDate", "endDate", "renewalLeadDays")
SELECT "id", "quotationId", "productId", "qty", "unitPrice", "discountPct", "billingType", "planId", "startDate", "endDate", "renewalLeadDays" FROM "QuotationLine";
DROP TABLE "QuotationLine";
ALTER TABLE "new_QuotationLine" RENAME TO "QuotationLine";
CREATE INDEX "QuotationLine_variantId_idx" ON "QuotationLine"("variantId");
CREATE UNIQUE INDEX "ProductVariant_productId_attribute_value_key" ON "ProductVariant"("productId", "attribute", "value");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
