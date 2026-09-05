/*
  Warnings:

  - Made the column `number` on table `CreditNote` required. This step will fail if there are existing NULL values in that column.
  - Made the column `reference` on table `Fulfilment` required. This step will fail if there are existing NULL values in that column.
  - Made the column `reference` on table `Subscription` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "QuotationLine" ADD COLUMN "renewalLeadDays" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CreditNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CreditNote" ("amount", "createdAt", "id", "invoiceId", "number", "reason") SELECT "amount", "createdAt", "id", "invoiceId", "number", "reason" FROM "CreditNote";
DROP TABLE "CreditNote";
ALTER TABLE "new_CreditNote" RENAME TO "CreditNote";
CREATE UNIQUE INDEX "CreditNote_number_key" ON "CreditNote"("number");
CREATE TABLE "new_Fulfilment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference" TEXT NOT NULL,
    "quotationId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "shipmentCost" REAL NOT NULL DEFAULT 0,
    "estDeliveryDate" DATETIME,
    "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Fulfilment_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Fulfilment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Fulfilment" ("createdAt", "estDeliveryDate", "id", "isManualOverride", "quotationId", "reference", "shipmentCost", "status", "warehouseId") SELECT "createdAt", "estDeliveryDate", "id", "isManualOverride", "quotationId", "reference", "shipmentCost", "status", "warehouseId" FROM "Fulfilment";
DROP TABLE "Fulfilment";
ALTER TABLE "new_Fulfilment" RENAME TO "Fulfilment";
CREATE UNIQUE INDEX "Fulfilment_reference_key" ON "Fulfilment"("reference");
CREATE TABLE "new_Quotation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "repId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "cancelReason" TEXT,
    "inquiryDate" DATETIME,
    "requestedDeliveryDate" DATETIME,
    "estimatedDeliveryDate" DATETIME,
    "riskScore" REAL NOT NULL DEFAULT 0,
    "requiresFinance" BOOLEAN NOT NULL DEFAULT false,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvalPendingSince" DATETIME,
    "dismissedUpsellIds" TEXT,
    "confirmedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "renewsSubscriptionId" INTEGER,
    "renewalPeriodStart" DATETIME,
    CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quotation_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quotation_renewsSubscriptionId_fkey" FOREIGN KEY ("renewsSubscriptionId") REFERENCES "Subscription" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Quotation" ("approvalPendingSince", "cancelReason", "confirmedAt", "createdAt", "customerId", "dismissedUpsellIds", "estimatedDeliveryDate", "id", "inquiryDate", "lastActivityAt", "notes", "number", "repId", "requestedDeliveryDate", "requiresFinance", "riskScore", "status", "updatedAt") SELECT "approvalPendingSince", "cancelReason", "confirmedAt", "createdAt", "customerId", "dismissedUpsellIds", "estimatedDeliveryDate", "id", "inquiryDate", "lastActivityAt", "notes", "number", "repId", "requestedDeliveryDate", "requiresFinance", "riskScore", "status", "updatedAt" FROM "Quotation";
DROP TABLE "Quotation";
ALTER TABLE "new_Quotation" RENAME TO "Quotation";
CREATE UNIQUE INDEX "Quotation_number_key" ON "Quotation"("number");
CREATE UNIQUE INDEX "Quotation_renewsSubscriptionId_renewalPeriodStart_key" ON "Quotation"("renewsSubscriptionId", "renewalPeriodStart");
CREATE TABLE "new_Subscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference" TEXT NOT NULL,
    "quotationLineId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "planId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPrice" REAL NOT NULL,
    "discountPct" REAL NOT NULL DEFAULT 0,
    "startDate" DATETIME NOT NULL,
    "nextBillingDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renewalLeadDays" INTEGER,
    CONSTRAINT "Subscription_quotationLineId_fkey" FOREIGN KEY ("quotationLineId") REFERENCES "QuotationLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RecurringPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Subscription" ("cancelledAt", "createdAt", "customerId", "discountPct", "endDate", "id", "nextBillingDate", "planId", "qty", "quotationLineId", "reference", "startDate", "status", "unitPrice") SELECT "cancelledAt", "createdAt", "customerId", "discountPct", "endDate", "id", "nextBillingDate", "planId", "qty", "quotationLineId", "reference", "startDate", "status", "unitPrice" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
CREATE UNIQUE INDEX "Subscription_reference_key" ON "Subscription"("reference");
CREATE UNIQUE INDEX "Subscription_quotationLineId_key" ON "Subscription"("quotationLineId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
