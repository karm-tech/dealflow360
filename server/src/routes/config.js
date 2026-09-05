// Everything the business rules read from, editable by an admin.
//
// These rows are policy, not records: a ceiling here decides whether a deal
// needs approval, a weight here decides whether a deal looks unhealthy. So a
// change is refused rather than half-applied, and anything still referenced
// cannot be deleted out from under the rule that reads it.

import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ROLES, USER_STATUS } from "../lib/constants.js";
import { logEvent } from "../lib/activity.js";
import { DEFAULT_HEALTH_WEIGHTS, readHealthWeights } from "../lib/dealHealthSettings.js";

export const configRouter = Router();

configRouter.use(requireAuth, requireRole(ROLES.ADMIN));

function firstIssue(parsed) {
  return parsed.error.issues[0].message;
}

// Every change here is worth a line in the audit trail: these are the numbers
// the rules read, so "who widened the ceiling" is a real question.
function record(req, detail) {
  return logEvent(req.db, { userId: req.user.id, action: "CONFIG_CHANGED", detail });
}

// --- categories -------------------------------------------------------------

const categorySchema = z.object({
  name: z.string().trim().min(2, "Give the category a name"),
  discountCeilingPct: z
    .number()
    .min(0, "A ceiling cannot be negative")
    .max(100, "A ceiling cannot be over 100%"),
});

configRouter.get("/categories", async (req, res) => {
  const categories = await req.db.category.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  res.json({
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      discountCeilingPct: category.discountCeilingPct,
      productCount: category._count.products,
    })),
  });
});

configRouter.post("/categories", async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  if (await req.db.category.findUnique({ where: { name: parsed.data.name } })) {
    return res.status(409).json({ error: "A category with that name already exists" });
  }

  const category = await req.db.category.create({ data: parsed.data });
  await record(req, `Created category ${category.name} with a ${category.discountCeilingPct}% ceiling`);

  res.status(201).json({ id: category.id });
});

configRouter.patch("/categories/:id", async (req, res) => {
  const parsed = categorySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const id = Number(req.params.id);
  const existing = await req.db.category.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "That category no longer exists" });

  if (parsed.data.name && parsed.data.name !== existing.name) {
    if (await req.db.category.findUnique({ where: { name: parsed.data.name } })) {
      return res.status(409).json({ error: "A category with that name already exists" });
    }
  }

  const category = await req.db.category.update({ where: { id }, data: parsed.data });

  if (parsed.data.discountCeilingPct !== undefined) {
    await record(
      req,
      `${category.name} ceiling ${existing.discountCeilingPct}% to ${category.discountCeilingPct}%`,
    );
  }

  res.json({ id: category.id });
});

// Products point at a category, so removing one in use would leave rows with a
// dangling ceiling. The count is named so the admin knows what to move first.
configRouter.delete("/categories/:id", async (req, res) => {
  const id = Number(req.params.id);
  const category = await req.db.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });

  if (!category) return res.status(404).json({ error: "That category no longer exists" });

  if (category._count.products > 0) {
    return res.status(409).json({
      error: `${category.name} still has ${category._count.products} product(s). Move them to another category first.`,
    });
  }

  await req.db.category.delete({ where: { id } });
  await record(req, `Deleted category ${category.name}`);

  res.json({ ok: true });
});

// --- tiers ------------------------------------------------------------------

const tierSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2, "Give the tier a code")
    .regex(/^[A-Z_]+$/, "Use capitals and underscores only, e.g. PLATINUM"),
  name: z.string().trim().min(2, "Give the tier a name"),
  maxDiscountPct: z
    .number()
    .min(0, "A ceiling cannot be negative")
    .max(100, "A ceiling cannot be over 100%"),
  sequence: z.number().int().min(0).default(0),
});

configRouter.get("/tiers", async (req, res) => {
  const tiers = await req.db.tier.findMany({
    include: { _count: { select: { customers: true, priceLists: true } } },
    orderBy: { sequence: "asc" },
  });

  res.json({
    tiers: tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      maxDiscountPct: tier.maxDiscountPct,
      sequence: tier.sequence,
      customerCount: tier._count.customers,
      priceListCount: tier._count.priceLists,
    })),
  });
});

configRouter.post("/tiers", async (req, res) => {
  const parsed = tierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  if (await req.db.tier.findUnique({ where: { id: parsed.data.id } })) {
    return res.status(409).json({ error: "A tier with that code already exists" });
  }
  if (await req.db.tier.findUnique({ where: { name: parsed.data.name } })) {
    return res.status(409).json({ error: "A tier with that name already exists" });
  }

  const tier = await req.db.tier.create({ data: parsed.data });
  await record(req, `Created tier ${tier.name} with a ${tier.maxDiscountPct}% ceiling`);

  res.status(201).json({ id: tier.id });
});

configRouter.patch("/tiers/:id", async (req, res) => {
  const parsed = tierSchema.partial().omit({ id: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const existing = await req.db.tier.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "That tier no longer exists" });

  if (parsed.data.name && parsed.data.name !== existing.name) {
    if (await req.db.tier.findUnique({ where: { name: parsed.data.name } })) {
      return res.status(409).json({ error: "A tier with that name already exists" });
    }
  }

  const tier = await req.db.tier.update({ where: { id: req.params.id }, data: parsed.data });

  if (parsed.data.maxDiscountPct !== undefined) {
    await record(req, `${tier.name} ceiling ${existing.maxDiscountPct}% to ${tier.maxDiscountPct}%`);
  }

  res.json({ id: tier.id });
});

configRouter.delete("/tiers/:id", async (req, res) => {
  const tier = await req.db.tier.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { customers: true, priceLists: true } } },
  });

  if (!tier) return res.status(404).json({ error: "That tier no longer exists" });

  if (tier._count.customers > 0) {
    return res.status(409).json({
      error: `${tier.name} still has ${tier._count.customers} customer(s). Move them to another tier first.`,
    });
  }
  if (tier._count.priceLists > 0) {
    return res.status(409).json({
      error: `${tier.name} still has ${tier._count.priceLists} price list(s) against it.`,
    });
  }

  // The portal hands new registrations this tier, so removing it would break
  // registration rather than anything visible here.
  const settings = await req.db.settings.findUnique({ where: { id: 1 } });
  if (settings?.portalDefaultTierId === tier.id) {
    return res.status(409).json({
      error: `${tier.name} is the tier new portal customers start on. Change that in Portal settings first.`,
    });
  }

  await req.db.tier.delete({ where: { id: tier.id } });
  await record(req, `Deleted tier ${tier.name}`);

  res.json({ ok: true });
});

// --- approval rule bands ----------------------------------------------------

const bandSchema = z
  .object({
    name: z.string().trim().min(2, "Give the band a name"),
    minOveragePoints: z.number().min(0, "The band cannot start below zero"),
    maxOveragePoints: z.number().positive("The band must end above zero").nullable(),
    requiresManager: z.boolean().default(true),
    requiresFinance: z.boolean().default(false),
    sequence: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
  })
  .refine((band) => band.requiresManager || band.requiresFinance, {
    message: "A band must require at least one approver, or it approves nothing",
  })
  .refine((band) => band.maxOveragePoints === null || band.maxOveragePoints > band.minOveragePoints, {
    message: "The band must end above where it starts",
  });

// Bands are read in sequence and the first match wins, so a gap means a
// quotation lands in no band and skips approval entirely. That is the one
// mistake here that loses money quietly, so it is reported rather than allowed.
function bandProblems(bands) {
  const active = bands
    .filter((band) => band.isActive)
    .sort((a, b) => a.minOveragePoints - b.minOveragePoints);

  if (active.length === 0) return ["No band is active, so no quotation will ever need approval."];

  const problems = [];

  // Zero overage means the discount is inside the ceiling, which the engine
  // never routes, so the first band only has to start at zero.
  if (active[0].minOveragePoints > 0) {
    problems.push(
      `Nothing covers 0 to ${active[0].minOveragePoints} points, so those quotations skip approval.`,
    );
  }

  for (let index = 0; index < active.length - 1; index += 1) {
    const band = active[index];
    const next = active[index + 1];

    if (band.maxOveragePoints === null) {
      problems.push(`${band.name} has no upper limit, so nothing after it is ever reached.`);
      break;
    }
    if (band.maxOveragePoints < next.minOveragePoints) {
      problems.push(
        `Nothing covers ${band.maxOveragePoints} to ${next.minOveragePoints} points, between ${band.name} and ${next.name}.`,
      );
    }
    if (band.maxOveragePoints > next.minOveragePoints) {
      problems.push(
        `${band.name} and ${next.name} overlap between ${next.minOveragePoints} and ${band.maxOveragePoints} points. The lower band wins.`,
      );
    }
  }

  if (active[active.length - 1].maxOveragePoints !== null) {
    problems.push(
      `Nothing covers above ${active[active.length - 1].maxOveragePoints} points, so the worst discounts skip approval.`,
    );
  }

  return problems;
}

configRouter.get("/approval-rules", async (req, res) => {
  const bands = await req.db.approvalRule.findMany({ orderBy: { sequence: "asc" } });

  const approvers = await Promise.all(
    [ROLES.SALES_MANAGER, ROLES.FINANCE].map(async (role) => ({
      role,
      count: await req.db.user.count({ where: { role, status: USER_STATUS.ACTIVE } }),
    })),
  );

  res.json({ bands, problems: bandProblems(bands), approvers });
});

configRouter.post("/approval-rules", async (req, res) => {
  const parsed = bandSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const band = await req.db.approvalRule.create({ data: parsed.data });
  await record(req, `Created approval band ${band.name}`);

  res.status(201).json({ id: band.id });
});

configRouter.patch("/approval-rules/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await req.db.approvalRule.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "That band no longer exists" });

  // Validated as the whole row rather than the patch, so the cross-field checks
  // still see the fields that are not changing.
  const parsed = bandSchema.safeParse({ ...existing, ...req.body });
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const band = await req.db.approvalRule.update({ where: { id }, data: parsed.data });
  await record(req, `Changed approval band ${band.name}`);

  res.json({ id: band.id });
});

configRouter.delete("/approval-rules/:id", async (req, res) => {
  const id = Number(req.params.id);
  const band = await req.db.approvalRule.findUnique({ where: { id } });
  if (!band) return res.status(404).json({ error: "That band no longer exists" });

  await req.db.approvalRule.delete({ where: { id } });
  await record(req, `Deleted approval band ${band.name}`);

  res.json({ ok: true });
});

// --- warehouses -------------------------------------------------------------

const warehouseSchema = z.object({
  name: z.string().trim().min(2, "Give the warehouse a name"),
  code: z
    .string()
    .trim()
    .min(2, "Give the warehouse a code")
    .regex(/^[A-Z0-9-]+$/, "Use capitals, digits and hyphens only, e.g. WH-PUNE"),
  city: z.string().trim().optional().nullable(),
  shippingWeight: z.number().positive("Shipping weight must be above zero").default(1),
  leadTimeDays: z.number().int().min(0, "Lead time cannot be negative").default(2),
  isActive: z.boolean().default(true),
});

configRouter.get("/warehouses", async (req, res) => {
  const warehouses = await req.db.warehouse.findMany({
    include: {
      stocks: { include: { product: { select: { name: true, sku: true, unit: true } } } },
      _count: { select: { fulfilments: true } },
    },
    orderBy: { name: "asc" },
  });

  res.json({
    warehouses: warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      code: warehouse.code,
      city: warehouse.city,
      shippingWeight: warehouse.shippingWeight,
      leadTimeDays: warehouse.leadTimeDays,
      isActive: warehouse.isActive,
      shipmentCount: warehouse._count.fulfilments,
      lineCount: warehouse.stocks.length,
      unitsOnHand: warehouse.stocks.reduce((sum, row) => sum + row.qty, 0),
      // Below the reorder level is the only stock figure worth surfacing here;
      // the full picture lives on the stock screen.
      lowStock: warehouse.stocks
        .filter((row) => row.qty <= row.reorderLevel)
        .map((row) => ({
          productId: row.productId,
          productName: row.product.name,
          sku: row.product.sku,
          qty: row.qty,
          reorderLevel: row.reorderLevel,
        })),
    })),
  });
});

configRouter.post("/warehouses", async (req, res) => {
  const parsed = warehouseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  if (await req.db.warehouse.findUnique({ where: { code: parsed.data.code } })) {
    return res.status(409).json({ error: "A warehouse with that code already exists" });
  }

  const warehouse = await req.db.warehouse.create({
    data: { ...parsed.data, city: parsed.data.city || null },
  });
  await record(req, `Created warehouse ${warehouse.name} (${warehouse.code})`);

  res.status(201).json({ id: warehouse.id });
});

configRouter.patch("/warehouses/:id", async (req, res) => {
  const parsed = warehouseSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const id = Number(req.params.id);
  const existing = await req.db.warehouse.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "That warehouse no longer exists" });

  if (parsed.data.code && parsed.data.code !== existing.code) {
    if (await req.db.warehouse.findUnique({ where: { code: parsed.data.code } })) {
      return res.status(409).json({ error: "A warehouse with that code already exists" });
    }
  }

  const warehouse = await req.db.warehouse.update({ where: { id }, data: parsed.data });

  if (parsed.data.isActive === false && existing.isActive) {
    await record(req, `Took ${warehouse.name} out of the shipment split`);
  } else {
    await record(req, `Changed warehouse ${warehouse.name}`);
  }

  res.json({ id: warehouse.id });
});

// Shipments point at the warehouse they went out from, so one that has ever
// shipped is history and is deactivated instead. Deactivating already removes
// it from the split, which is what the admin actually wants.
configRouter.delete("/warehouses/:id", async (req, res) => {
  const id = Number(req.params.id);
  const warehouse = await req.db.warehouse.findUnique({
    where: { id },
    include: { _count: { select: { fulfilments: true } }, stocks: true },
  });

  if (!warehouse) return res.status(404).json({ error: "That warehouse no longer exists" });

  if (warehouse._count.fulfilments > 0) {
    return res.status(409).json({
      error: `${warehouse.name} has ${warehouse._count.fulfilments} shipment(s) against it, so it cannot be deleted. Deactivate it instead.`,
    });
  }

  const onHand = warehouse.stocks.reduce((sum, row) => sum + row.qty, 0);
  if (onHand > 0) {
    return res.status(409).json({
      error: `${warehouse.name} still holds ${onHand} unit(s). Move the stock out first.`,
    });
  }

  await req.db.warehouse.delete({ where: { id } });
  await record(req, `Deleted warehouse ${warehouse.name}`);

  res.json({ ok: true });
});

// --- price lists ------------------------------------------------------------

const priceListSchema = z.object({
  name: z.string().trim().min(2, "Give the price list a name"),
  tierId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

const priceItemSchema = z.object({
  productId: z.number().int().positive("Choose a product"),
  price: z.number().nonnegative("A price cannot be negative"),
});

configRouter.get("/price-lists", async (req, res) => {
  const lists = await req.db.priceList.findMany({
    include: {
      tier: { select: { id: true, name: true } },
      items: {
        include: { product: { select: { id: true, name: true, sku: true, salesPrice: true } } },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { id: "asc" },
  });

  res.json({
    priceLists: lists.map((list) => ({
      id: list.id,
      name: list.name,
      // A list with no tier prices everyone; one with a tier beats it for that
      // tier's customers.
      tier: list.tier,
      currency: list.currency,
      isActive: list.isActive,
      items: list.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        sku: item.product.sku,
        listPrice: item.product.salesPrice,
        price: item.price,
      })),
    })),
  });
});

configRouter.post("/price-lists", async (req, res) => {
  const parsed = priceListSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const tierId = parsed.data.tierId || null;
  if (tierId && !(await req.db.tier.findUnique({ where: { id: tierId } }))) {
    return res.status(400).json({ error: "That tier no longer exists" });
  }

  const list = await req.db.priceList.create({ data: { ...parsed.data, tierId } });
  await record(req, `Created price list ${list.name}`);

  res.status(201).json({ id: list.id });
});

configRouter.patch("/price-lists/:id", async (req, res) => {
  const parsed = priceListSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const id = Number(req.params.id);
  if (!(await req.db.priceList.findUnique({ where: { id } }))) {
    return res.status(404).json({ error: "That price list no longer exists" });
  }

  const data = { ...parsed.data };
  if (data.tierId !== undefined) {
    data.tierId = data.tierId || null;
    if (data.tierId && !(await req.db.tier.findUnique({ where: { id: data.tierId } }))) {
      return res.status(400).json({ error: "That tier no longer exists" });
    }
  }

  const list = await req.db.priceList.update({ where: { id }, data });
  await record(req, `Changed price list ${list.name}`);

  res.json({ id: list.id });
});

// Deleting a list takes its rows with it, which only affects what future lines
// are priced at: a line already on a quotation captured its price when added.
configRouter.delete("/price-lists/:id", async (req, res) => {
  const id = Number(req.params.id);
  const list = await req.db.priceList.findUnique({ where: { id } });
  if (!list) return res.status(404).json({ error: "That price list no longer exists" });

  await req.db.priceList.delete({ where: { id } });
  await record(req, `Deleted price list ${list.name}`);

  res.json({ ok: true });
});

configRouter.post("/price-lists/:id/items", async (req, res) => {
  const parsed = priceItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const priceListId = Number(req.params.id);
  const list = await req.db.priceList.findUnique({ where: { id: priceListId } });
  if (!list) return res.status(404).json({ error: "That price list no longer exists" });

  const product = await req.db.product.findUnique({ where: { id: parsed.data.productId } });
  if (!product) return res.status(400).json({ error: "That product no longer exists" });

  const existing = await req.db.priceListItem.findUnique({
    where: { priceListId_productId: { priceListId, productId: product.id } },
  });

  if (existing) {
    await req.db.priceListItem.update({
      where: { id: existing.id },
      data: { price: parsed.data.price },
    });
    await record(req, `${product.name} on ${list.name}: ${existing.price} to ${parsed.data.price}`);
    return res.json({ id: existing.id, updated: true });
  }

  const item = await req.db.priceListItem.create({
    data: { priceListId, productId: product.id, price: parsed.data.price },
  });
  await record(req, `Priced ${product.name} at ${parsed.data.price} on ${list.name}`);

  res.status(201).json({ id: item.id });
});

configRouter.delete("/price-lists/:id/items/:itemId", async (req, res) => {
  const itemId = Number(req.params.itemId);
  const item = await req.db.priceListItem.findUnique({
    where: { id: itemId },
    include: { product: { select: { name: true } }, priceList: { select: { name: true } } },
  });

  if (!item) return res.status(404).json({ error: "That price no longer exists" });

  await req.db.priceListItem.delete({ where: { id: itemId } });
  await record(req, `Removed ${item.product.name} from ${item.priceList.name}`);

  res.json({ ok: true });
});

// --- deal health and routing thresholds -------------------------------------

const weightSchema = z.object({
  stalledPerDay: z.number().min(0).max(50),
  stalledCap: z.number().min(0).max(100),
  discountAnomaly: z.number().min(0).max(100),
  slippagePerDay: z.number().min(0).max(50),
  slippageCap: z.number().min(0).max(100),
  approvalWaitPerDay: z.number().min(0).max(50),
  approvalWaitCap: z.number().min(0).max(100),
});

const thresholdSchema = z.object({
  stalledAfterDays: z.number().int().min(1, "A deal cannot stall in under a day"),
  discountAnomalyThresholdPct: z
    .number()
    .min(0)
    .max(100, "An anomaly threshold cannot be over 100 points"),
  minQuotesForRepAverage: z
    .number()
    .int()
    .min(1, "At least one quotation is needed before there is an average"),
  healthWeights: weightSchema,
});

configRouter.get("/deal-health", async (req, res) => {
  const settings = await req.db.settings.findUnique({ where: { id: 1 } });

  res.json({
    settings: {
      stalledAfterDays: settings.stalledAfterDays,
      discountAnomalyThresholdPct: settings.discountAnomalyThresholdPct,
      minQuotesForRepAverage: settings.minQuotesForRepAverage,
      healthWeights: readHealthWeights(settings),
    },
    defaults: DEFAULT_HEALTH_WEIGHTS,
  });
});

configRouter.patch("/deal-health", async (req, res) => {
  const parsed = thresholdSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const { healthWeights, ...thresholds } = parsed.data;

  await req.db.settings.update({
    where: { id: 1 },
    data: { ...thresholds, healthWeights: JSON.stringify(healthWeights) },
  });

  await record(req, `Changed the deal health thresholds`);

  res.json({ ok: true });
});

// --- operational settings ---------------------------------------------------

const operationsSchema = z.object({
  currency: z.string().trim().length(3, "Use a three letter currency code"),
  defaultShippingCost: z.number().nonnegative("A shipping cost cannot be negative"),
  paymentTermsDays: z.number().int().min(0, "Payment terms cannot be negative"),
  minUpsellMarginPct: z.number().min(0).max(100, "A margin floor cannot be over 100%"),
});

configRouter.get("/operations", async (req, res) => {
  const settings = await req.db.settings.findUnique({ where: { id: 1 } });

  res.json({
    settings: {
      currency: settings.currency,
      defaultShippingCost: settings.defaultShippingCost,
      paymentTermsDays: settings.paymentTermsDays,
      minUpsellMarginPct: settings.minUpsellMarginPct,
    },
  });
});

configRouter.patch("/operations", async (req, res) => {
  const parsed = operationsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  await req.db.settings.update({ where: { id: 1 }, data: parsed.data });
  await record(req, "Changed the operational settings");

  res.json({ ok: true });
});
