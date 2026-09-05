// Seed data. Covers every product combination the app supports, and the states
// are real: a stalled quote has an old activity timestamp rather than a flag,
// so the detectors have to find it themselves.

import "dotenv/config";
import bcrypt from "bcryptjs";
import { demoDb, liveDb, disconnectAll } from "../src/lib/prisma.js";
import {
  ROLES,
  QUOTATION_STATUS,
  BILLING_TYPE,
  APPROVAL_STATUS,
  USER_STATUS,
} from "../src/lib/constants.js";

// Which database this run writes to:
//   npm run seed       -> demo.db  full sample data
//   npm run seed:live  -> dev.db   master data only
const isLive = process.argv.includes("--live");
const db = isLive ? liveDb : demoDb;

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

// --- wipe -------------------------------------------------------------------

// Delete children before parents so no foreign key is left dangling.
async function clearEverything() {
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
      isReturnable: true,
      defaultBillingType: BILLING_TYPE.RECURRING,
      defaultPlanId: "MONTHLY",
    },
    {
      name: "Onsite Setup Service",
      sku: "SV-SETUP",
      categoryId: categories.service.id,
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
    data: { name: "Main Warehouse", code: "MAIN", city: "Ahmedabad", shippingWeight: 1.0 },
  });
  const east = await db.warehouse.create({
    data: { name: "East Depot", code: "EAST", city: "Kolkata", shippingWeight: 1.4 },
  });

  await db.stock.createMany({
    data: [
      { warehouseId: main.id, productId: products["HW-LAP-14"].id, qty: 6, reorderLevel: 4 },
      { warehouseId: main.id, productId: products["HW-DOCK-01"].id, qty: 40, reorderLevel: 10 },
      { warehouseId: main.id, productId: products["HW-SW-24"].id, qty: 12, reorderLevel: 5 },
      { warehouseId: main.id, productId: products["HW-PRN-RENT"].id, qty: 5, reorderLevel: 2 },

      { warehouseId: east.id, productId: products["HW-LAP-14"].id, qty: 7, reorderLevel: 4 },
      { warehouseId: east.id, productId: products["HW-DOCK-01"].id, qty: 15, reorderLevel: 10 },
      { warehouseId: east.id, productId: products["HW-SW-24"].id, qty: 3, reorderLevel: 5 },
      { warehouseId: east.id, productId: products["HW-PRN-RENT"].id, qty: 4, reorderLevel: 2 },
    ],
  });

  return { main, east };
}

// Small overage is a manager's call. A big one needs finance as well.
async function createApprovalRules() {
  await db.approvalRule.createMany({
    data: [
      {
        name: "Manager approval",
        minOveragePoints: 0.01,
        maxOveragePoints: 10,
        requiresManager: true,
        requiresFinance: false,
        sequence: 1,
      },
      {
        name: "Manager then Finance",
        minOveragePoints: 10,
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
      promisedDeliveryDate: daysFromNow(10),
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
    extra: { promisedDeliveryDate: daysFromNow(4) },
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
      promisedDeliveryDate: daysFromNow(6),
      riskScore: 6,
    },
    lines: [
      line(products["HW-LAP-14"], 5, 60000, 14, BILLING_TYPE.ONE_TIME),
      line(products["SV-SETUP"], 1, 40000, 16, BILLING_TYPE.ONE_TIME),
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

  // 6) One of Sneha's, so the pipeline is not all from a single rep.
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

  return { acme };
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
  const users = await createUsers(customers);
  await createAccessRequests();

  console.log("Seeding quotations...");
  await createQuotations(customers, users, products);
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
