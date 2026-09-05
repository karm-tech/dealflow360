-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN "attachmentName" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "stalledAfterDays" INTEGER NOT NULL DEFAULT 7,
    "discountAnomalyThresholdPct" REAL NOT NULL DEFAULT 10,
    "minQuotesForRepAverage" INTEGER NOT NULL DEFAULT 5,
    "healthWeights" TEXT NOT NULL DEFAULT '{"stalledPerDay":3,"stalledCap":30,"discountAnomaly":25,"slippagePerDay":3,"slippageCap":25,"approvalWaitPerDay":2,"approvalWaitCap":20}',
    "financeApprovalOveragePoints" REAL NOT NULL DEFAULT 10,
    "defaultShippingCost" REAL NOT NULL DEFAULT 250,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "minUpsellMarginPct" REAL NOT NULL DEFAULT 20,
    "portalSalesRepId" INTEGER,
    "portalDefaultTierId" TEXT NOT NULL DEFAULT 'BRONZE',
    "companyName" TEXT NOT NULL DEFAULT 'DealFlow360',
    "companyAddress" TEXT,
    "companyGstin" TEXT,
    "companyPhone" TEXT,
    "companyEmail" TEXT,
    "companyWebsite" TEXT,
    "documentFooter" TEXT,
    "logoPath" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT,
    "smtpPassword" TEXT,
    "smtpFrom" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Settings_portalSalesRepId_fkey" FOREIGN KEY ("portalSalesRepId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Settings" ("currency", "defaultShippingCost", "discountAnomalyThresholdPct", "financeApprovalOveragePoints", "healthWeights", "id", "minQuotesForRepAverage", "minUpsellMarginPct", "paymentTermsDays", "portalDefaultTierId", "portalSalesRepId", "stalledAfterDays", "updatedAt") SELECT "currency", "defaultShippingCost", "discountAnomalyThresholdPct", "financeApprovalOveragePoints", "healthWeights", "id", "minQuotesForRepAverage", "minUpsellMarginPct", "paymentTermsDays", "portalDefaultTierId", "portalSalesRepId", "stalledAfterDays", "updatedAt" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
