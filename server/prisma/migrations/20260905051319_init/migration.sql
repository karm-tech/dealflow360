-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" INTEGER,
    CONSTRAINT "User_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "maxDiscountPct" REAL NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "tierId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Customer_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "discountCeilingPct" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "taxRatePct" REAL NOT NULL DEFAULT 18,
    "salesPrice" REAL NOT NULL,
    "cost" REAL NOT NULL,
    "isStockable" BOOLEAN NOT NULL DEFAULT true,
    "isReturnable" BOOLEAN NOT NULL DEFAULT false,
    "defaultBillingType" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "defaultPlanId" TEXT,
    "warrantyMonths" INTEGER,
    "isPromoted" BOOLEAN NOT NULL DEFAULT false,
    "minMarginPct" REAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_defaultPlanId_fkey" FOREIGN KEY ("defaultPlanId") REFERENCES "RecurringPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "attribute" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "extraPrice" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "tierId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PriceList_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceListItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "priceListId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    CONSTRAINT "PriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PriceListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecurringPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "prorationEnabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT,
    "shippingWeight" REAL NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "warehouseId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Stock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Stock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "repId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "cancelReason" TEXT,
    "promisedDeliveryDate" DATETIME,
    "estimatedDeliveryDate" DATETIME,
    "riskScore" REAL NOT NULL DEFAULT 0,
    "requiresFinance" BOOLEAN NOT NULL DEFAULT false,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvalPendingSince" DATETIME,
    "confirmedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quotation_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuotationLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quotationId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" REAL NOT NULL,
    "discountPct" REAL NOT NULL DEFAULT 0,
    "billingType" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "planId" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuotationLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QuotationLine_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RecurringPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "minOveragePoints" REAL NOT NULL,
    "maxOveragePoints" REAL,
    "requiresManager" BOOLEAN NOT NULL DEFAULT true,
    "requiresFinance" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quotationId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "actorId" INTEGER,
    "reason" TEXT,
    "actedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalStep_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalStep_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quotationId" INTEGER,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Fulfilment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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

-- CreateTable
CREATE TABLE "FulfilmentLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fulfilmentId" INTEGER NOT NULL,
    "quotationLineId" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    CONSTRAINT "FulfilmentLine_fulfilmentId_fkey" FOREIGN KEY ("fulfilmentId") REFERENCES "Fulfilment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FulfilmentLine_quotationLineId_fkey" FOREIGN KEY ("quotationLineId") REFERENCES "QuotationLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    CONSTRAINT "Subscription_quotationLineId_fkey" FOREIGN KEY ("quotationLineId") REFERENCES "QuotationLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RecurringPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BillingSchedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "subscriptionId" INTEGER NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "isProrated" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "invoiceId" INTEGER,
    CONSTRAINT "BillingSchedule_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillingSchedule_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "quotationId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATETIME,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    CONSTRAINT "Invoice_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" REAL NOT NULL,
    "discountPct" REAL NOT NULL DEFAULT 0,
    "taxRatePct" REAL NOT NULL DEFAULT 0,
    "lineTotal" REAL NOT NULL,
    "quotationLineId" INTEGER,
    CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "reference" TEXT,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quotationId" INTEGER NOT NULL,
    "quotationLineId" INTEGER,
    "authorId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "counterDiscountPct" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalMessage_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PortalMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UpsellRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "suggestedProductId" INTEGER NOT NULL,
    "weight" REAL NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "UpsellRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UpsellRule_suggestedProductId_fkey" FOREIGN KEY ("suggestedProductId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "stalledAfterDays" INTEGER NOT NULL DEFAULT 7,
    "discountAnomalyThresholdPct" REAL NOT NULL DEFAULT 10,
    "minQuotesForRepAverage" INTEGER NOT NULL DEFAULT 5,
    "healthWeights" TEXT NOT NULL DEFAULT '{"stalledPerDay":3,"stalledCap":30,"discountAnomaly":25,"slippagePerDay":3,"slippageCap":25,"approvalWaitPerDay":2,"approvalWaitCap":20}',
    "financeApprovalOveragePoints" REAL NOT NULL DEFAULT 10,
    "defaultShippingCost" REAL NOT NULL DEFAULT 250,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Tier_name_key" ON "Tier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_priceListId_productId_key" ON "PriceListItem"("priceListId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringPlan_name_key" ON "RecurringPlan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_warehouseId_productId_key" ON "Stock"("warehouseId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_number_key" ON "Quotation"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_quotationLineId_key" ON "Subscription"("quotationLineId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "UpsellRule_productId_suggestedProductId_key" ON "UpsellRule"("productId", "suggestedProductId");
