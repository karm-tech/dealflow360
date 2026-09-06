// Seed data. Covers every product combination the app supports, and the states
// are real: a stalled quote has an old activity timestamp rather than a flag,
// so the detectors have to find it themselves.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { demoDb, liveDb, disconnectAll } from "../src/lib/prisma.js";
import { UPLOADS_DIR } from "../src/lib/uploads.js";
import {
  ROLES,
  QUOTATION_STATUS,
  BILLING_TYPE,
  APPROVAL_STATUS,
  USER_STATUS,
} from "../src/lib/constants.js";
import { executeFulfilment, suggestFulfilment } from "../src/lib/fulfilmentService.js";
import { billConfirmedOrder, refreshInvoiceStatus } from "../src/lib/billingService.js";

// Which database this run writes to:
//   npm run seed       -> demo.db  full sample data
//   npm run seed:live  -> dev.db   master data only
const isLive = process.argv.includes("--live");
const db = isLive ? liveDb : demoDb;
const mode = isLive ? "live" : "demo";

// Every demo account uses this password. Shown in the README.
const DEMO_PASSWORD = "demo1234";

// --- small date helpers -----------------------------------------------------

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// --- wipe -------------------------------------------------------------------

// Delete children before parents so no foreign key is left dangling.
async function clearEverything() {
  await db.notification.deleteMany();
  await db.emailMessage.deleteMany();
  await db.creditNote.deleteMany();
  await db.payment.deleteMany();
  await db.invoiceLine.deleteMany();
  await db.billingSchedule.deleteMany();
  await db.invoice.deleteMany();
  await db.subscription.deleteMany();
  await db.fulfilmentLine.deleteMany();
  await db.fulfilment.deleteMany();
  await db.portalMessage.deleteMany();
  await db.activityLog.deleteMany();
  await db.approvalStep.deleteMany();
  await db.quotationLine.deleteMany();
  await db.quotation.deleteMany();
  await db.approvalRule.deleteMany();
  await db.upsellRule.deleteMany();
  await db.stock.deleteMany();
  await db.warehouse.deleteMany();
  await db.priceListItem.deleteMany();
  await db.priceList.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.user.deleteMany();
  await db.customer.deleteMany();
  await db.tier.deleteMany();
  await db.recurringPlan.deleteMany();
  await db.settings.deleteMany();
}

// --- configuration ----------------------------------------------------------

// Mail settings are edited on the settings screen and read from the database at
// send time. These are only the values a fresh install starts with, so an
// installation's own mail server survives a reseed instead of being retyped.
function smtpFromEnv() {
  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  if (!host) return {};

  // A username that is not an address means the placeholder was never replaced.
  // Seeding it would leave every message failing on a bad login, so the
  // installation stays on the outbox until real credentials are in place.
  if (!user.includes("@")) {
    console.log("Ignoring SMTP_HOST: SMTP_USER is not set to an email address.");
    return {};
  }

  return {
    smtpHost: host,
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpSecure: process.env.SMTP_SECURE === "true",
    smtpUser: user,
    smtpPassword: process.env.SMTP_PASS || null,
    smtpFrom: (process.env.MAIL_FROM || "").trim() || null,
  };
}

// Copied into uploads so a reseed always restores the same file the PDFs read.
function installCompanyLogo() {
  const source = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets", "company-logo.png");
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const filename = `logo-${mode}.png`;
  fs.copyFileSync(source, path.join(UPLOADS_DIR, filename));
  return `/uploads/${filename}`;
}

async function createSettings() {
  await db.settings.create({
    data: {
      id: 1,
      currency: "INR",
      stalledAfterDays: 7,
      discountAnomalyThresholdPct: 10,
      minQuotesForRepAverage: 3,
      financeApprovalOveragePoints: 10,
      defaultShippingCost: 250,
      companyName: "DealFlow360",
      companyAddress: "401 Iscon Centre, S G Highway, Ahmedabad 380015",
      companyGstin: "24AABCU9603R1ZM",
      companyPhone: "+91 79 4000 3600",
      companyEmail: "sales@dealflow360.test",
      companyWebsite: "https://dealflow360.test",
      documentFooter: "Payment within 30 days. Goods remain our property until paid for in full.",
      logoPath: installCompanyLogo(),
      ...smtpFromEnv(),
    },
  });
}

async function createTiers() {
  await db.tier.createMany({
    data: [
      { id: "BRONZE", name: "Bronze", maxDiscountPct: 5, sequence: 1 },
      { id: "SILVER", name: "Silver", maxDiscountPct: 10, sequence: 2 },
      { id: "GOLD", name: "Gold", maxDiscountPct: 15, sequence: 3 },
    ],
  });
}

async function createPlans() {
  await db.recurringPlan.createMany({
    data: [
      { id: "MONTHLY", name: "Monthly", interval: "MONTH", intervalCount: 1 },
      { id: "QUARTERLY", name: "Quarterly", interval: "QUARTER", intervalCount: 1 },
      { id: "YEARLY", name: "Yearly", interval: "YEAR", intervalCount: 1 },
    ],
  });
}

// Ceilings differ by category because margins differ.
async function createCategories() {
  const hardware = await db.category.create({
    data: { name: "Hardware", discountCeilingPct: 15 },
  });
  const service = await db.category.create({
    data: { name: "Service", discountCeilingPct: 10 },
  });
  const subscription = await db.category.create({
    data: { name: "Subscription", discountCeilingPct: 12 },
  });
  return { hardware, service, subscription };
}

// --- catalogue --------------------------------------------------------------

// Deliberately covers every combination of the two independent flags:
//   stockable + one-time      -> a laptop
//   not stockable + one-time  -> an installation service
//   not stockable + recurring -> a support plan
//   stockable + recurring     -> a printer on rent (it ships AND bills monthly)
async function createProducts(categories) {
  const rows = [
    {
      name: "Laptop Pro 14",
      sku: "HW-LAP-14",
      categoryId: categories.hardware.id,
      description: "14-inch business laptop. RAM variants add to the list price.",
      salesPrice: 60000,
      cost: 44000,
      isStockable: true,
      defaultBillingType: BILLING_TYPE.ONE_TIME,
      warrantyMonths: 12,
    },
    {
      name: "Docking Station",
      sku: "HW-DOCK-01",
      categoryId: categories.hardware.id,
      description: "USB-C dock with dual display and gigabit ethernet.",
      salesPrice: 8000,
      cost: 5200,
      isStockable: true,
      defaultBillingType: BILLING_TYPE.ONE_TIME,
      isPromoted: true,
    },
    {
      name: "Network Switch 24-port",
      sku: "HW-SW-24",
      categoryId: categories.hardware.id,
      salesPrice: 15000,
      cost: 10500,
      isStockable: true,
      defaultBillingType: BILLING_TYPE.ONE_TIME,
    },
    {
      name: "Laser Printer (Rental)",
      sku: "HW-PRN-RENT",
      categoryId: categories.hardware.id,
      unit: "month",
      salesPrice: 2000,
      cost: 900,
      isStockable: true,
      defaultBillingType: BILLING_TYPE.RECURRING,
      defaultPlanId: "MONTHLY",
    },
    {
      name: "Wireless Mouse",
      sku: "HW-MOUSE",
      categoryId: categories.hardware.id,
      salesPrice: 1500,
      cost: 900,
      isStockable: true,
      defaultBillingType: BILLING_TYPE.ONE_TIME,
    },
    // Promoted but unrelated to laptops. The suggestion panel must still leave
    // it out of a laptop deal.
    {
      name: "Smartphone X2",
      sku: "HW-PHONE",
      categoryId: categories.hardware.id,
      salesPrice: 45000,
      cost: 33000,
      isStockable: true,
      defaultBillingType: BILLING_TYPE.ONE_TIME,
      isPromoted: true,
      warrantyMonths: 12,
    },
    {
      name: "Phone Cover",
      sku: "HW-CASE",
      categoryId: categories.hardware.id,
      salesPrice: 800,
      cost: 400,
      isStockable: true,
      defaultBillingType: BILLING_TYPE.ONE_TIME,
    },
    {
      name: "Screen Protector",
      sku: "HW-SCRN",
      categoryId: categories.hardware.id,
      salesPrice: 500,
      cost: 250,
      isStockable: true,
      defaultBillingType: BILLING_TYPE.ONE_TIME,
    },
    {
      name: "Onsite Setup Service",
      sku: "SV-SETUP",
      categoryId: categories.service.id,
      description: "One-day onsite installation and handover for hardware orders.",
      salesPrice: 40000,
      cost: 22000,
      isStockable: false,
      defaultBillingType: BILLING_TYPE.ONE_TIME,
    },
    {
      name: "Training Workshop",
      sku: "SV-TRAIN",
      categoryId: categories.service.id,
      salesPrice: 25000,
      cost: 12000,
      isStockable: false,
      defaultBillingType: BILLING_TYPE.ONE_TIME,
    },
    {
      name: "Extended Warranty 2yr",
      sku: "SV-WARR-2Y",
      categoryId: categories.service.id,
      salesPrice: 9000,
      cost: 3000,
      isStockable: false,
      defaultBillingType: BILLING_TYPE.ONE_TIME,
      isPromoted: true,
    },
    {
      name: "AMC Support (per seat)",
      sku: "SB-AMC",
      categoryId: categories.subscription.id,
      description: "Remote support per seat. 24x7 cover costs extra.",
      unit: "month",
      salesPrice: 800,
      cost: 300,
      isStockable: false,
      defaultBillingType: BILLING_TYPE.RECURRING,
      defaultPlanId: "MONTHLY",
    },
    {
      name: "DealFlow Cloud Licence",
      sku: "SB-CLOUD",
      categoryId: categories.subscription.id,
      unit: "month",
      salesPrice: 1200,
      cost: 400,
      isStockable: false,
      defaultBillingType: BILLING_TYPE.RECURRING,
      defaultPlanId: "MONTHLY",
    },
    {
      name: "Backup Storage Plan",
      sku: "SB-BACKUP",
      categoryId: categories.subscription.id,
      unit: "quarter",
      salesPrice: 1500,
      cost: 600,
      isStockable: false,
      defaultBillingType: BILLING_TYPE.RECURRING,
      defaultPlanId: "QUARTERLY",
    },
  ];

  const products = {};
  for (const row of rows) {
    const created = await db.product.create({ data: row });
    products[created.sku] = created;
  }

  // A couple of variants so the product form has something to show.
  await db.productVariant.createMany({
    data: [
      { productId: products["HW-LAP-14"].id, attribute: "RAM", value: "16 GB", extraPrice: 0 },
      { productId: products["HW-LAP-14"].id, attribute: "RAM", value: "32 GB", extraPrice: 9000 },
      { productId: products["SB-AMC"].id, attribute: "Cover", value: "Business hours", extraPrice: 0 },
      { productId: products["SB-AMC"].id, attribute: "Cover", value: "24x7", extraPrice: 350 },
    ],
  });

  return products;
}

async function createPriceLists(products) {
  const gold = await db.priceList.create({
    data: { name: "Gold Tier Pricing", tierId: "GOLD", currency: "INR" },
  });
  const standard = await db.priceList.create({
    data: { name: "Standard Pricing", currency: "INR" },
  });

  await db.priceListItem.createMany({
    data: [
      { priceListId: gold.id, productId: products["HW-LAP-14"].id, price: 57000 },
      { priceListId: gold.id, productId: products["HW-SW-24"].id, price: 14000 },
      { priceListId: standard.id, productId: products["HW-LAP-14"].id, price: 60000 },
      { priceListId: standard.id, productId: products["HW-SW-24"].id, price: 15000 },
    ],
  });
}

// Stock is set so the demo can prove two things without any tricks:
//  - ordering 10 laptops cannot be filled from one warehouse (6 + 7 available)
//    so the split has to use both
//  - only 15 switches exist in total, so an order for 20 must go to backorder
async function createWarehouses(products) {
  const main = await db.warehouse.create({
    data: {
      name: "Main Warehouse",
      code: "MAIN",
      city: "Ahmedabad",
      shippingWeight: 1.0,
      leadTimeDays: 2,
    },
  });
  const east = await db.warehouse.create({
    data: {
      name: "East Depot",
      code: "EAST",
      city: "Kolkata",
      shippingWeight: 1.4,
      leadTimeDays: 4,
    },
  });

  await db.stock.createMany({
    data: [
      { warehouseId: main.id, productId: products["HW-LAP-14"].id, qty: 6, reorderLevel: 4, replenishmentDays: 10 },
      { warehouseId: main.id, productId: products["HW-DOCK-01"].id, qty: 40, reorderLevel: 10, replenishmentDays: 7 },
      { warehouseId: main.id, productId: products["HW-SW-24"].id, qty: 12, reorderLevel: 5, replenishmentDays: 21 },
      { warehouseId: main.id, productId: products["HW-PRN-RENT"].id, qty: 5, reorderLevel: 2, replenishmentDays: 14 },

      { warehouseId: east.id, productId: products["HW-LAP-14"].id, qty: 7, reorderLevel: 4, replenishmentDays: 12 },
      { warehouseId: east.id, productId: products["HW-DOCK-01"].id, qty: 15, reorderLevel: 10, replenishmentDays: 9 },
      { warehouseId: east.id, productId: products["HW-SW-24"].id, qty: 3, reorderLevel: 5, replenishmentDays: 28 },
      { warehouseId: east.id, productId: products["HW-PRN-RENT"].id, qty: 4, reorderLevel: 2, replenishmentDays: 16 },

      { warehouseId: main.id, productId: products["HW-MOUSE"].id, qty: 120, reorderLevel: 20 },
      { warehouseId: main.id, productId: products["HW-PHONE"].id, qty: 25, reorderLevel: 5 },
      { warehouseId: main.id, productId: products["HW-CASE"].id, qty: 90, reorderLevel: 20 },
      { warehouseId: main.id, productId: products["HW-SCRN"].id, qty: 140, reorderLevel: 30 },
    ],
  });

  return { main, east };
}

// Small overage is a manager's call. A big one needs finance as well.
async function createApprovalRules() {
  await db.approvalRule.createMany({
    data: [
      // Starts at zero because the engine already refuses to route a quotation
      // with no overage; a band starting above zero would leave a sliver of
      // overage covered by nothing.
      {
        name: "Manager approval",
        minOveragePoints: 0,
        maxOveragePoints: 5,
        requiresManager: true,
        requiresFinance: false,
        sequence: 1,
      },
      {
        name: "Manager then Finance",
        minOveragePoints: 5,
        maxOveragePoints: null,
        requiresManager: true,
        requiresFinance: true,
        sequence: 2,
      },
    ],
  });
}

async function createUpsellRules(products) {
  await db.upsellRule.createMany({
    data: [
      { productId: products["HW-LAP-14"].id, suggestedProductId: products["HW-DOCK-01"].id, weight: 3 },
      { productId: products["HW-LAP-14"].id, suggestedProductId: products["SV-WARR-2Y"].id, weight: 2 },
      { productId: products["HW-LAP-14"].id, suggestedProductId: products["SB-AMC"].id, weight: 1.5 },
      { productId: products["HW-SW-24"].id, suggestedProductId: products["SV-SETUP"].id, weight: 2 },
      { productId: products["SB-CLOUD"].id, suggestedProductId: products["SB-BACKUP"].id, weight: 1.5 },
      { productId: products["HW-PHONE"].id, suggestedProductId: products["HW-CASE"].id, weight: 3 },
      { productId: products["HW-PHONE"].id, suggestedProductId: products["HW-SCRN"].id, weight: 2 },
    ],
  });
}

// --- people -----------------------------------------------------------------

async function createCustomers() {
  const rows = [
    { name: "Acme Corp", email: "accounts@acme.test", city: "Ahmedabad", state: "Gujarat", tierId: "GOLD" },
    { name: "Beta Industries", email: "buying@beta.test", city: "Pune", state: "Maharashtra", tierId: "SILVER" },
    { name: "Cyrus Traders", email: "info@cyrus.test", city: "Surat", state: "Gujarat", tierId: "BRONZE" },
    { name: "Delta Systems", email: "ops@delta.test", city: "Bengaluru", state: "Karnataka", tierId: "GOLD" },
    // On Gold by an old decision, but walks away from deals and pays late. The
    // reliability score is what notices, and it suggests pulling the ceiling
    // back without touching it.
    { name: "Gamma Ltd", email: "purchase@gamma.test", city: "Indore", state: "Madhya Pradesh", tierId: "GOLD" },
  ];

  const customers = {};
  for (const row of rows) {
    const created = await db.customer.create({ data: row });
    customers[created.name] = created;
  }
  return customers;
}

async function createUsers(customers) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const internal = [
    { name: "Admin User", email: "admin@dealflow360.test", role: ROLES.ADMIN },
    { name: "Karan Mehta", email: "rep@dealflow360.test", role: ROLES.SALES_REP },
    { name: "Sneha Rao", email: "rep2@dealflow360.test", role: ROLES.SALES_REP },
    { name: "Manager User", email: "manager@dealflow360.test", role: ROLES.SALES_MANAGER },
    { name: "Meera Iyer", email: "manager2@dealflow360.test", role: ROLES.SALES_MANAGER },
    { name: "Finance User", email: "finance@dealflow360.test", role: ROLES.FINANCE },
  ];

  const users = {};
  for (const row of internal) {
    const created = await db.user.create({
      data: { ...row, passwordHash, status: USER_STATUS.ACTIVE },
    });
    users[created.email] = created;
  }

  // One portal login per customer. A portal user can only ever see the quotes
  // belonging to the customer they are linked to.
  const portal = [
    { name: "Acme Buyer", email: "acme@portal.test", customer: "Acme Corp" },
    { name: "Beta Buyer", email: "beta@portal.test", customer: "Beta Industries" },
    { name: "Cyrus Buyer", email: "cyrus@portal.test", customer: "Cyrus Traders" },
    { name: "Delta Buyer", email: "delta@portal.test", customer: "Delta Systems" },
    { name: "Gamma Buyer", email: "gamma@portal.test", customer: "Gamma Ltd" },
  ];

  for (const row of portal) {
    const created = await db.user.create({
      data: {
        name: row.name,
        email: row.email,
        passwordHash,
        role: ROLES.CUSTOMER,
        status: USER_STATUS.ACTIVE,
        customerId: customers[row.customer].id,
      },
    });
    users[created.email] = created;
  }

  return users;
}

// Signups waiting on an admin. No role at all until one is granted.
async function createAccessRequests() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const pending = [
    { name: "Priya Nair", email: "priya.nair@dealflow360.test", requestedRole: ROLES.SALES_REP },
    { name: "Rohit Desai", email: "rohit.desai@dealflow360.test", requestedRole: ROLES.SALES_MANAGER },
    // Requested ADMIN; the approving admin decides what is actually granted.
    { name: "Vikram Shah", email: "vikram.shah@dealflow360.test", requestedRole: ROLES.ADMIN },
  ];

  for (const row of pending) {
    await db.user.create({
      data: { ...row, passwordHash, role: null, status: USER_STATUS.PENDING },
    });
  }
}

// --- quotations -------------------------------------------------------------

// Writes the quotation plus its lines, and logs a matching activity entry so
// lastActivityAt is backed by a real event rather than typed in by hand.
async function createQuotation({ number, customer, rep, status, lines, activityAt, extra = {} }) {
  const quotation = await db.quotation.create({
    data: {
      number,
      customerId: customer.id,
      repId: rep.id,
      status,
      lastActivityAt: activityAt,
      createdAt: activityAt,
      updatedAt: activityAt,
      // The customer got in touch a few days before the quotation was written.
      inquiryDate: new Date(activityAt.getTime() - 3 * 24 * 60 * 60 * 1000),
      ...extra,
      lines: { create: lines },
    },
  });

  await db.activityLog.create({
    data: {
      quotationId: quotation.id,
      userId: rep.id,
      action: "QUOTATION_CREATED",
      detail: `Quotation ${number} created for ${customer.name}`,
      createdAt: activityAt,
    },
  });

  if (["SENT", "UNDER_NEGOTIATION", "CONFIRMED", "REJECTED"].includes(status)) {
    await db.activityLog.create({
      data: {
        quotationId: quotation.id,
        userId: rep.id,
        action: "QUOTATION_SENT",
        detail: `Sent to ${customer.name}`,
        createdAt: activityAt,
      },
    });
  }

  return quotation;
}

function line(product, qty, unitPrice, discountPct, billingType, planId, startDate) {
  return {
    productId: product.id,
    qty,
    unitPrice,
    discountPct,
    billingType,
    planId: planId || null,
    startDate: startDate || null,
  };
}

async function createQuotations(customers, users, products) {
  const karan = users["rep@dealflow360.test"];
  const sneha = users["rep2@dealflow360.test"];

  // 1) One quote mixing all four kinds of line. The Setup Service line is over
  //    its own 10% ceiling, which is what flags the whole quotation.
  const acme = await createQuotation({
    number: "DF-Q-1001",
    customer: customers["Acme Corp"],
    rep: karan,
    status: QUOTATION_STATUS.DRAFT,
    activityAt: daysAgo(1),
    extra: {
      requestedDeliveryDate: daysFromNow(10),
      notes: "Office refresh — 10 seats, plus support and a printer on rent.",
    },
    lines: [
      line(products["HW-LAP-14"], 10, 60000, 12, BILLING_TYPE.ONE_TIME),
      line(products["SV-SETUP"], 1, 40000, 18, BILLING_TYPE.ONE_TIME),
      line(products["SB-AMC"], 10, 800, 5, BILLING_TYPE.RECURRING, "MONTHLY", daysFromNow(15)),
      line(products["HW-PRN-RENT"], 2, 2000, 0, BILLING_TYPE.RECURRING, "MONTHLY", daysFromNow(15)),
    ],
  });

  // 2) Stalled: no activity for two weeks, found by comparing lastActivityAt
  //    with today rather than by a flag.
  await createQuotation({
    number: "DF-Q-1002",
    customer: customers["Beta Industries"],
    rep: karan,
    status: QUOTATION_STATUS.SENT,
    activityAt: daysAgo(14),
    extra: { requestedDeliveryDate: daysFromNow(4) },
    lines: [
      line(products["HW-SW-24"], 4, 15000, 8, BILLING_TYPE.ONE_TIME),
      line(products["SV-TRAIN"], 1, 25000, 6, BILLING_TYPE.ONE_TIME),
    ],
  });

  // 3) Discount anomaly: Karan's other quotes sit around 6-9%. This one is 32%,
  //    which is far above his own average, not just above a fixed limit.
  await createQuotation({
    number: "DF-Q-1003",
    customer: customers["Cyrus Traders"],
    rep: karan,
    status: QUOTATION_STATUS.DRAFT,
    activityAt: daysAgo(2),
    lines: [
      line(products["HW-LAP-14"], 3, 60000, 32, BILLING_TYPE.ONE_TIME),
      line(products["HW-DOCK-01"], 3, 8000, 30, BILLING_TYPE.ONE_TIME),
    ],
  });

  // 4) Sitting in approval for a week — the approval-wait penalty picks this up.
  const waiting = await createQuotation({
    number: "DF-Q-1004",
    customer: customers["Delta Systems"],
    rep: sneha,
    status: QUOTATION_STATUS.PENDING_APPROVAL,
    activityAt: daysAgo(7),
    extra: {
      approvalPendingSince: daysAgo(7),
      requestedDeliveryDate: daysFromNow(6),
      riskScore: 2,
    },
    lines: [
      line(products["HW-LAP-14"], 5, 60000, 14, BILLING_TYPE.ONE_TIME),
      line(products["SV-SETUP"], 1, 40000, 12, BILLING_TYPE.ONE_TIME),
    ],
  });

  await db.approvalStep.create({
    data: {
      quotationId: waiting.id,
      sequence: 1,
      role: ROLES.SALES_MANAGER,
      status: APPROVAL_STATUS.PENDING,
      createdAt: daysAgo(7),
    },
  });

  // 4b) Typed in by the customer on the portal rather than by a rep. It arrives
  //     as an undiscounted draft with the buyer's own note attached, which is
  //     what the rep picks up and prices.
  const fromPortal = await createQuotation({
    number: "DF-Q-1009",
    customer: customers["Cyrus Traders"],
    rep: karan,
    status: QUOTATION_STATUS.DRAFT,
    activityAt: daysAgo(1),
    extra: { inquiryDate: daysAgo(1) },
    lines: [
      line(products["HW-PHONE"], 6, 45000, 0, BILLING_TYPE.ONE_TIME),
      line(products["HW-CASE"], 6, 800, 0, BILLING_TYPE.ONE_TIME),
    ],
  });

  await db.portalMessage.create({
    data: {
      quotationId: fromPortal.id,
      authorId: users["cyrus@portal.test"].id,
      text: "Six handsets for the new sales team, with covers. We would need them within a fortnight — can you confirm that is possible before we commit?",
      createdAt: daysAgo(1),
    },
  });

  // 4c) Two deals that have genuinely gone wrong, so the health score has
  //     something to find. Both are live, so both are scored: the numbers on the
  //     dashboard come from these rows rather than from anything stored.

  // Abandoned for six weeks and discounted far past what Karan normally gives,
  // for a customer who has walked away before. Three separate penalties.
  await createQuotation({
    number: "DF-Q-1010",
    customer: customers["Gamma Ltd"],
    rep: karan,
    status: QUOTATION_STATUS.SENT,
    activityAt: daysAgo(41),
    extra: {
      requestedDeliveryDate: daysAgo(12),
      estimatedDeliveryDate: daysFromNow(9),
      riskScore: 19,
    },
    lines: [
      line(products["HW-LAP-14"], 8, 60000, 34, BILLING_TYPE.ONE_TIME),
      line(products["SV-SETUP"], 1, 40000, 30, BILLING_TYPE.ONE_TIME),
    ],
  });

  // Quiet for a fortnight with the delivery already slipping. Enough to be worth
  // a nudge, not enough to be critical.
  await createQuotation({
    number: "DF-Q-1011",
    customer: customers["Beta Industries"],
    rep: sneha,
    status: QUOTATION_STATUS.SENT,
    activityAt: daysAgo(19),
    extra: {
      requestedDeliveryDate: daysAgo(3),
      estimatedDeliveryDate: daysFromNow(5),
      riskScore: 4,
    },
    lines: [
      line(products["HW-SW-24"], 6, 15000, 9, BILLING_TYPE.ONE_TIME),
      line(products["HW-DOCK-01"], 6, 8000, 7, BILLING_TYPE.ONE_TIME),
    ],
  });

  // 5) Karan's history, so the anomaly detector has an average to compare to.
  const history = [
    { number: "DF-Q-0901", customer: "Acme Corp", discount: 7, days: 40 },
    { number: "DF-Q-0902", customer: "Beta Industries", discount: 9, days: 34 },
    { number: "DF-Q-0903", customer: "Delta Systems", discount: 6, days: 27 },
    { number: "DF-Q-0904", customer: "Acme Corp", discount: 8, days: 20 },
  ];

  for (const row of history) {
    await createQuotation({
      number: row.number,
      customer: customers[row.customer],
      rep: karan,
      status: QUOTATION_STATUS.CONFIRMED,
      activityAt: daysAgo(row.days),
      extra: { confirmedAt: daysAgo(row.days - 2) },
      lines: [line(products["HW-DOCK-01"], 5, 8000, row.discount, BILLING_TYPE.ONE_TIME)],
    });
  }

  // 5b) Gamma's track record — the evidence behind their reliability score.
  //     Three deals they walked away from and two they saw through but paid
  //     late. None of this is entered as a score; the score reads these rows.
  const gammaRecord = [
    { number: "DF-Q-0701", status: QUOTATION_STATUS.REJECTED, days: 95 },
    { number: "DF-Q-0702", status: QUOTATION_STATUS.CONFIRMED, days: 88 },
    { number: "DF-Q-0703", status: QUOTATION_STATUS.REJECTED, days: 74 },
    { number: "DF-Q-0704", status: QUOTATION_STATUS.CANCELLED, days: 61 },
    { number: "DF-Q-0705", status: QUOTATION_STATUS.CONFIRMED, days: 52 },
  ];

  for (const row of gammaRecord) {
    await createQuotation({
      number: row.number,
      customer: customers["Gamma Ltd"],
      rep: sneha,
      status: row.status,
      activityAt: daysAgo(row.days),
      extra:
        row.status === QUOTATION_STATUS.CONFIRMED
          ? { confirmedAt: daysAgo(row.days - 4) }
          : { cancelReason: "Went with another supplier on price" },
      lines: [line(products["HW-LAP-14"], 4, 60000, 11, BILLING_TYPE.ONE_TIME)],
    });
  }

  // 6) Past orders the suggestion panel learns from. Laptops mostly sell with a
  //    mouse, phones mostly with a cover, and the two groups never overlap — so
  //    a phone cannot be suggested alongside a laptop however it is promoted.
  //    Kept on Sneha so Karan's discount average stays where the anomaly
  //    detector needs it.
  const basket = [
    { sku: ["HW-LAP-14", "HW-MOUSE", "HW-DOCK-01"] },
    { sku: ["HW-LAP-14", "HW-MOUSE", "HW-DOCK-01"] },
    { sku: ["HW-LAP-14", "HW-MOUSE"] },
    { sku: ["HW-LAP-14", "HW-MOUSE", "SV-WARR-2Y"] },
    { sku: ["HW-LAP-14", "HW-MOUSE", "SV-WARR-2Y"] },
    { sku: ["HW-LAP-14", "HW-DOCK-01"] },
    { sku: ["HW-LAP-14", "HW-MOUSE"] },
    { sku: ["HW-LAP-14", "HW-SW-24"] },
    { sku: ["HW-PHONE", "HW-CASE", "HW-SCRN"] },
    { sku: ["HW-PHONE", "HW-CASE"] },
    { sku: ["HW-PHONE", "HW-CASE", "HW-SCRN"] },
    { sku: ["HW-PHONE", "HW-CASE"] },
    { sku: ["HW-PHONE", "HW-SCRN"] },
    { sku: ["HW-PHONE", "HW-CASE"] },
  ];

  const basketCustomers = ["Acme Corp", "Beta Industries", "Cyrus Traders", "Delta Systems"];

  for (let index = 0; index < basket.length; index += 1) {
    const days = 90 - index * 4;
    await createQuotation({
      number: `DF-Q-08${String(index + 1).padStart(2, "0")}`,
      customer: customers[basketCustomers[index % basketCustomers.length]],
      rep: sneha,
      status: QUOTATION_STATUS.CONFIRMED,
      activityAt: daysAgo(days),
      extra: { confirmedAt: daysAgo(days - 2) },
      lines: basket[index].sku.map((sku) =>
        line(products[sku], 2, products[sku].salesPrice, 4 + (index % 5), BILLING_TYPE.ONE_TIME),
      ),
    });
  }

  // 7) One of Sneha's, so the pipeline is not all from a single rep.
  await createQuotation({
    number: "DF-Q-1005",
    customer: customers["Delta Systems"],
    rep: sneha,
    status: QUOTATION_STATUS.DRAFT,
    activityAt: daysAgo(1),
    lines: [
      line(products["SB-CLOUD"], 25, 1200, 4, BILLING_TYPE.RECURRING, "MONTHLY", daysFromNow(7)),
      line(products["SB-BACKUP"], 1, 1500, 0, BILLING_TYPE.RECURRING, "QUARTERLY", daysFromNow(7)),
    ],
  });

  // 8) Approved and waiting to ship. Ten laptops cannot come from one
  //    warehouse (6 + 7 in stock), so the split has to use both.
  const splitOrder = await createQuotation({
    number: "DF-Q-1006",
    customer: customers["Beta Industries"],
    rep: karan,
    status: QUOTATION_STATUS.APPROVED,
    activityAt: daysAgo(2),
    extra: { requestedDeliveryDate: daysFromNow(12) },
    lines: [
      line(products["HW-LAP-14"], 10, products["HW-LAP-14"].salesPrice, 6, BILLING_TYPE.ONE_TIME),
      line(products["SV-SETUP"], 1, products["SV-SETUP"].salesPrice, 5, BILLING_TYPE.ONE_TIME),
    ],
  });

  // 9) Approved, but only 15 switches exist against an order for 20, so five
  //    go to backorder and the delivery date lands past what was promised.
  const backorderOrder = await createQuotation({
    number: "DF-Q-1007",
    customer: customers["Cyrus Traders"],
    rep: sneha,
    status: QUOTATION_STATUS.APPROVED,
    activityAt: daysAgo(3),
    extra: { requestedDeliveryDate: daysFromNow(10) },
    lines: [
      line(products["HW-SW-24"], 20, products["HW-SW-24"].salesPrice, 4, BILLING_TYPE.ONE_TIME),
    ],
  });

  // 10) A mixed deal the customer has agreed to. Two one-time lines, an AMC and
  //     a printer on rent, so the same order both ships and bills monthly. The
  //     recurring lines start part way through this month, which is what makes
  //     the first period a short one. Left approved here; confirming it is what
  //     raises the billing.
  const mixedOrder = await createQuotation({
    number: "DF-Q-1008",
    customer: customers["Acme Corp"],
    rep: karan,
    status: QUOTATION_STATUS.APPROVED,
    activityAt: daysAgo(5),
    extra: {
      requestedDeliveryDate: daysFromNow(9),
      notes: "Ten docks, onsite setup, AMC per seat and two printers on rent.",
    },
    lines: [
      line(products["HW-DOCK-01"], 10, products["HW-DOCK-01"].salesPrice, 6, BILLING_TYPE.ONE_TIME),
      line(products["SV-SETUP"], 1, products["SV-SETUP"].salesPrice, 8, BILLING_TYPE.ONE_TIME),
      line(products["SB-AMC"], 10, 800, 5, BILLING_TYPE.RECURRING, "MONTHLY", daysAgo(2)),
      line(products["HW-PRN-RENT"], 2, 2000, 0, BILLING_TYPE.RECURRING, "MONTHLY", daysAgo(2)),
    ],
  });

  return { acme, waiting, splitOrder, backorderOrder, mixedOrder };
}

const VOLUME_COMPANIES = [
  "Helix Motors", "Nova Textiles", "Orion Pharma", "Pinnacle Steel", "Quanta Labs",
  "Ridge Logistics", "Summit Hotels", "Tidal Energy", "Umber Foods", "Vertex Media",
  "Willow Bank", "Yarrow Clinics", "Zenith Apparel", "Amber Freight", "Beacon Glass",
  "Cedar Electronics", "Dune Cement", "Echo Packaging", "Flint Tools", "Grove Dairy",
  "Harbor Shipping", "Ivory Papers", "Jasper Mines", "Kite Aviation", "Lumen Power",
  "Maple Furniture", "Nimbus Cloud Co", "Oakridge Schools", "Pearl Jewellery", "Quartz Interiors",
  "Riverdale Farms", "Slate Architects", "Terra Builders", "Upland Coffee", "Vale Chemicals",
  "Wickham Motors",
];

const VOLUME_CITIES = [
  ["Mumbai", "Maharashtra"],
  ["Jaipur", "Rajasthan"],
  ["Hyderabad", "Telangana"],
  ["Chennai", "Tamil Nadu"],
  ["Kochi", "Kerala"],
  ["Lucknow", "Uttar Pradesh"],
  ["Bhopal", "Madhya Pradesh"],
  ["Chandigarh", "Punjab"],
  ["Vadodara", "Gujarat"],
  ["Nagpur", "Maharashtra"],
];

async function createVolumeCustomers() {
  const extra = [];

  for (let index = 0; index < VOLUME_COMPANIES.length; index += 1) {
    const [city, state] = VOLUME_CITIES[index % VOLUME_CITIES.length];
    const customer = await db.customer.create({
      data: {
        name: VOLUME_COMPANIES[index],
        email: `accounts.v${String(index + 1).padStart(2, "0")}@volume.test`,
        phone: `079-4000-${String(1000 + index).slice(-4)}`,
        city,
        state,
        tierId: ["BRONZE", "SILVER", "GOLD"][index % 3],
      },
    });
    extra.push(customer);
  }

  return extra;
}

const VOLUME_STATUSES = [
  { status: QUOTATION_STATUS.DRAFT, idle: 1 },
  { status: QUOTATION_STATUS.DRAFT, idle: 16 },
  { status: QUOTATION_STATUS.PENDING_APPROVAL, idle: 2, pending: true },
  { status: QUOTATION_STATUS.PENDING_APPROVAL, idle: 9, pending: true },
  { status: QUOTATION_STATUS.APPROVED, idle: 1 },
  { status: QUOTATION_STATUS.SENT, idle: 3 },
  { status: QUOTATION_STATUS.SENT, idle: 22 },
  { status: QUOTATION_STATUS.UNDER_NEGOTIATION, idle: 5 },
  { status: QUOTATION_STATUS.CONFIRMED, confirmed: true },
  { status: QUOTATION_STATUS.CONFIRMED, confirmed: true },
  { status: QUOTATION_STATUS.CONFIRMED, confirmed: true },
  { status: QUOTATION_STATUS.REJECTED },
  { status: QUOTATION_STATUS.CANCELLED },
];

const LOST_REASONS = [
  "Budget withdrawn",
  "Went with another supplier on price",
  "Project postponed to next quarter",
  "Scope changed — they will re-quote later",
];

// Closed volume deals are spread over ~five months. This month stays light;
// dumping every loss on today is what made the chart jump.
function volumeClosedDays(index) {
  const roll = (index * 17 + (index % 5) * 3) % 100;
  if (roll < 8) return 3 + (index % 4);
  if (roll < 28) return 12 + (index % 18);
  if (roll < 50) return 32 + (index % 22);
  if (roll < 70) return 58 + (index % 22);
  if (roll < 86) return 88 + (index % 20);
  return 118 + (index % 28);
}

const VOLUME_BASKETS = [
  ["HW-MOUSE"],
  ["HW-CASE", "HW-SCRN"],
  ["SV-TRAIN"],
  ["SB-CLOUD"],
  ["SB-BACKUP"],
  ["SV-WARR-2Y"],
  ["HW-DOCK-01", "HW-MOUSE"],
  ["SB-AMC"],
];

// Fills lists, charts and reports. Hand-built quotes above stay the ones that
// prove a specific rule; these just give every stage and mix a real population.
async function createVolumeBook({ namedCustomers, extraCustomers, users, products }) {
  const reps = [users["rep@dealflow360.test"], users["rep2@dealflow360.test"]];
  const book = [...Object.values(namedCustomers), ...extraCustomers];
  const billed = [];

  for (let index = 0; index < 280; index += 1) {
    const scenario = VOLUME_STATUSES[index % VOLUME_STATUSES.length];
    const customer = book[index % book.length];
    const rep = reps[index % reps.length];
    const skus = VOLUME_BASKETS[index % VOLUME_BASKETS.length];
    const discount = [0, 3, 5, 8, 12, 18][index % 6];
    const closed =
      scenario.status === QUOTATION_STATUS.CONFIRMED ||
      scenario.status === QUOTATION_STATUS.CANCELLED ||
      scenario.status === QUOTATION_STATUS.REJECTED;
    const activityAt = closed
      ? daysAgo(volumeClosedDays(index))
      : daysAgo(scenario.idle + (index % 8));
    const extra = {};

    if (scenario.pending) extra.approvalPendingSince = activityAt;
    if (scenario.confirmed) extra.confirmedAt = addDays(activityAt, 1);
    if (
      scenario.status === QUOTATION_STATUS.CANCELLED ||
      scenario.status === QUOTATION_STATUS.REJECTED
    ) {
      extra.cancelReason = LOST_REASONS[index % LOST_REASONS.length];
    }

    const quotation = await createQuotation({
      number: `DF-Q-${2001 + index}`,
      customer,
      rep,
      status: scenario.status,
      activityAt,
      extra,
      lines: skus.map((sku) => {
        const product = products[sku];
        const recurring = product.defaultBillingType === BILLING_TYPE.RECURRING;
        return line(
          product,
          1 + (index % 4),
          product.salesPrice,
          discount,
          product.defaultBillingType,
          recurring ? product.defaultPlanId : null,
          recurring ? activityAt : null,
        );
      }),
    });

    if (scenario.pending) {
      await db.approvalStep.create({
        data: {
          quotationId: quotation.id,
          sequence: 1,
          role: ROLES.SALES_MANAGER,
          status: APPROVAL_STATUS.PENDING,
          createdAt: activityAt,
        },
      });
    }

    // Service and subscription confirms only — hardware stock is reserved for
    // the split and backorder quotes the fulfilment screens walk through.
    if (
      scenario.confirmed &&
      index % 7 === 0 &&
      skus.every((sku) => !products[sku].isStockable)
    ) {
      billed.push(quotation);
    }
  }

  const financeId = users["finance@dealflow360.test"].id;
  for (const quotation of billed) {
    const full = await db.quotation.findUnique({
      where: { id: quotation.id },
      include: {
        customer: true,
        rep: true,
        lines: { include: { product: true, plan: true } },
      },
    });
    await billConfirmedOrder(db, mode, full, financeId);
    await dateInvoicesFrom(full.id, full.confirmedAt || full.createdAt);

    if (quotation.id % 2 === 0) {
      const invoice = await db.invoice.findFirst({ where: { quotationId: full.id } });
      if (!invoice) continue;
      await db.payment.create({
        data: {
          invoiceId: invoice.id,
          method: "BANK",
          amount: invoice.total,
          reference: `NEFT-V${invoice.id}`,
          paidAt: addDays(invoice.issueDate, 8),
        },
      });
      await refreshInvoiceStatus(db, invoice.id);
    }
  }
}

// --- billing ----------------------------------------------------------------

// Agreeing an order is what takes the stock and raises the billing, so the demo
// runs the same steps the accept action runs rather than writing invoices and
// subscriptions by hand.
async function confirmOrder(orderId, userId, confirmedAt) {
  await suggestFulfilment(db, orderId);

  await db.quotation.update({
    where: { id: orderId },
    data: { status: QUOTATION_STATUS.CONFIRMED, confirmedAt },
  });

  const order = await db.quotation.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      rep: true,
      lines: { include: { product: true, plan: true } },
    },
  });

  await executeFulfilment(db, mode, order, userId);
  await billConfirmedOrder(db, mode, order, userId);
  await dateInvoicesFrom(order.id, confirmedAt);

  return order;
}

// An invoice is raised with today's date. For an order agreed in the past that
// would put every due date in the future, so the invoice is dated from the day
// the order was actually confirmed.
async function dateInvoicesFrom(quotationId, issueDate) {
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  const termsDays = settings?.paymentTermsDays ?? 30;

  await db.invoice.updateMany({
    where: { quotationId },
    data: { issueDate, dueDate: addDays(issueDate, termsDays) },
  });
}

// How each of the older orders was settled. Between them the order book holds
// one of every state: unpaid past its due date, paid late, part paid, and paid.
//   settle     share of the invoice received
//   daysToPay  days after the invoice date the money arrived
const PAST_ORDER_SETTLEMENTS = [
  { number: "DF-Q-0901", settle: 0, daysToPay: 0 },
  { number: "DF-Q-0902", settle: 1, daysToPay: 31 },
  { number: "DF-Q-0903", settle: 0.4, daysToPay: 10 },
  { number: "DF-Q-0904", settle: 1, daysToPay: 6 },
  // Gamma settles eventually, well past the 30 day terms. Both invoices read as
  // paid, which is the point: the score is about when, not whether.
  { number: "DF-Q-0702", settle: 1, daysToPay: 72 },
  { number: "DF-Q-0705", settle: 1, daysToPay: 65 },
];

// Orders confirmed before today already carry their invoices. Payments are
// written against the invoice and the status is then recalculated, so a seeded
// invoice reads as paid because money covers it, not because a column says so.
async function billPastOrders(userId) {
  for (const row of PAST_ORDER_SETTLEMENTS) {
    const order = await db.quotation.findUnique({
      where: { number: row.number },
      include: {
        customer: true,
        rep: true,
        lines: { include: { product: true, plan: true } },
      },
    });
    if (!order) continue;

    await billConfirmedOrder(db, mode, order, userId);

    const issueDate = order.confirmedAt || order.createdAt;
    await dateInvoicesFrom(order.id, issueDate);

    const invoice = await db.invoice.findFirst({ where: { quotationId: order.id } });
    if (!invoice || row.settle === 0) continue;

    await db.payment.create({
      data: {
        invoiceId: invoice.id,
        method: "BANK",
        amount: Math.round(invoice.total * row.settle * 100) / 100,
        reference: `NEFT-${invoice.number.replace(/\D/g, "")}`,
        paidAt: addDays(issueDate, row.daysToPay),
      },
    });

    await refreshInvoiceStatus(db, invoice.id);
  }
}

// --- run --------------------------------------------------------------------

// Master data both instances need: settings, tiers, plans, categories,
// approval rules and the catalogue.
async function seedMasterData() {
  console.log("Seeding configuration...");
  await createSettings();
  await createTiers();
  await createPlans();
  const categories = await createCategories();
  await createApprovalRules();

  console.log("Seeding catalogue and inventory...");
  const products = await createProducts(categories);
  await createPriceLists(products);
  await createWarehouses(products);
  await createUpsellRules(products);

  return products;
}

// Live gets master data and one admin: an empty order book, as a fresh
// installation would be.
async function seedLive() {
  await seedMasterData();

  console.log("Creating the first admin...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await db.user.create({
    data: {
      name: "Admin User",
      email: "admin@dealflow360.test",
      passwordHash,
      role: ROLES.ADMIN,
      status: USER_STATUS.ACTIVE,
    },
  });
}

// Demo gets everything: catalogue, customers, portal logins and the quotations
// the detectors need to find.
async function seedDemo() {
  const products = await seedMasterData();

  console.log("Seeding people...");
  const customers = await createCustomers();
  const extraCustomers = await createVolumeCustomers();
  const users = await createUsers(customers);
  await createAccessRequests();

  // Portal requests need an owner before one can arrive, so the demo names one.
  await db.settings.update({
    where: { id: 1 },
    data: { portalSalesRepId: users["rep@dealflow360.test"].id },
  });

  console.log("Seeding quotations...");
  const { waiting, splitOrder, backorderOrder, mixedOrder } = await createQuotations(
    customers,
    users,
    products,
  );

  console.log("Seeding the rest of the order book...");
  await createVolumeBook({
    namedCustomers: customers,
    extraCustomers,
    users,
    products,
  });

  // Run the real allocation rather than writing shipments by hand, so the
  // seeded split is the same one the app would produce.
  console.log("Allocating stock for approved orders...");
  await suggestFulfilment(db, splitOrder.id);
  await suggestFulfilment(db, backorderOrder.id);

  // After the suggestions above, so agreeing this order cannot take stock the
  // two approved splits were worked out from.
  console.log("Confirming the mixed order and billing the order book...");
  await confirmOrder(mixedOrder.id, users["rep@dealflow360.test"].id, daysAgo(2));
  await billPastOrders(users["finance@dealflow360.test"].id);

  console.log("Seeding alerts for the waiting approval...");
  await createPendingAlerts(users, waiting);
}

// The quotation already sitting with a manager has the alerts it would have
// raised, so the bell and the outbox both have something in them on first look.
async function createPendingAlerts(users, waiting) {
  const managers = [
    users["manager@dealflow360.test"],
    users["manager2@dealflow360.test"],
    users["admin@dealflow360.test"],
  ];

  for (const manager of managers) {
    await db.notification.create({
      data: {
        userId: manager.id,
        type: "APPROVAL_REQUESTED",
        title: `${waiting.number} needs your approval`,
        body: "Delta Systems · discount risk 2 points",
        quotationId: waiting.id,
        createdAt: daysAgo(7),
      },
    });

    await db.emailMessage.create({
      data: {
        to: manager.email,
        subject: `${waiting.number} needs your approval`,
        body: "Delta Systems · discount risk 2 points",
        quotationId: waiting.id,
        createdAt: daysAgo(7),
      },
    });
  }

  const admin = users["admin@dealflow360.test"];
  await db.notification.createMany({
    data: [
      {
        userId: admin.id,
        type: "DEAL_ESCALATED",
        title: `${waiting.number} was escalated`,
        body: "Delta Systems · still waiting after a week",
        quotationId: waiting.id,
        createdAt: daysAgo(1),
      },
      {
        userId: admin.id,
        type: "PORTAL_REQUEST",
        title: "New portal request",
        body: "A customer asked for a quotation from the catalogue",
        createdAt: daysAgo(0),
      },
    ],
  });
}

async function main() {
  const label = isLive ? "live (dev.db)" : "demo (demo.db)";
  console.log(`Seeding the ${label} database.\n`);

  console.log("Clearing old data...");
  await clearEverything();

  if (isLive) {
    await seedLive();
  } else {
    await seedDemo();
  }

  const counts = {
    users: await db.user.count(),
    customers: await db.customer.count(),
    products: await db.product.count(),
    warehouses: await db.warehouse.count(),
    quotations: await db.quotation.count(),
    quotationLines: await db.quotationLine.count(),
    invoices: await db.invoice.count(),
    payments: await db.payment.count(),
    subscriptions: await db.subscription.count(),
    fulfilments: await db.fulfilment.count(),
  };

  console.log("\nSeed complete:");
  for (const [name, value] of Object.entries(counts)) {
    console.log(`  ${name.padEnd(16)} ${value}`);
  }
  console.log(`\nEvery account uses the password: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectAll();
  });
