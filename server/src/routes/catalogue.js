import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { BILLING_TYPE, INTERNAL_ROLES, QUOTATION_STATUS, ROLES } from "../lib/constants.js";
import { priceForTier } from "../lib/pricing.js";
import { onHandQty } from "../lib/stock.js";
import { quotationSummary, QUOTATION_INCLUDE } from "../lib/quotationView.js";
import { billingCounts } from "../lib/billingService.js";
import { logEvent } from "../lib/activity.js";

export const catalogueRouter = Router();

// Cost and margin appear on these responses, so the whole router is staff only.
catalogueRouter.use(requireAuth, requireRole(...INTERNAL_ROLES));

// A smart button counts live records. A cancelled deal is dead history: it stays
// reachable through the list's stage filter but never inflates a count.
const OPEN_STATUSES = [
  QUOTATION_STATUS.DRAFT,
  QUOTATION_STATUS.PENDING_APPROVAL,
  QUOTATION_STATUS.APPROVED,
  QUOTATION_STATUS.SENT,
  QUOTATION_STATUS.UNDER_NEGOTIATION,
];

const LIVE_STATUSES = [...OPEN_STATUSES, QUOTATION_STATUS.CONFIRMED];

function marginPct(price, cost) {
  if (!price) return 0;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

// Search and limit are applied in the query rather than after it, so a picker
// never pulls the whole catalogue across to filter in the browser.
function searchLimit(value, fallback = 20) {
  const limit = Number(value);
  return Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : fallback;
}

catalogueRouter.get("/products", async (req, res) => {
  const tierId = req.query.tierId ? String(req.query.tierId) : null;
  const search = req.query.q ? String(req.query.q).trim() : "";

  const products = await req.db.product.findMany({
    where: {
      isActive: true,
      ...(search
        ? { OR: [{ name: { contains: search } }, { sku: { contains: search } }] }
        : {}),
    },
    include: {
      category: true,
      stocks: true,
      variants: { orderBy: [{ attribute: "asc" }, { extraPrice: "asc" }] },
      priceListItems: { include: { priceList: true } },
      defaultPlan: true,
    },
    orderBy: [{ categoryId: "asc" }, { name: "asc" }],
    ...(req.query.limit ? { take: searchLimit(req.query.limit) } : {}),
  });

  res.json({
    products: products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        description: product.description,
        category: product.category.name,
        categoryCeilingPct: product.category.discountCeilingPct,
        unit: product.unit,
        price: priceForTier(product, tierId),
        listPrice: product.salesPrice,
        taxRatePct: product.taxRatePct,
        defaultBillingType: product.defaultBillingType,
        defaultPlanId: product.defaultPlanId,
        isStockable: product.isStockable,
        onHand: onHandQty(product),
        isPromoted: product.isPromoted,
        variants: product.variants.map((variant) => ({
          id: variant.id,
          attribute: variant.attribute,
          value: variant.value,
          extraPrice: variant.extraPrice,
        })),
      })),
  });
});

catalogueRouter.get("/products/:id", async (req, res) => {
  const product = await req.db.product.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      category: true,
      defaultPlan: true,
      variants: true,
      priceListItems: { include: { priceList: { include: { tier: true } } } },
      stocks: { include: { warehouse: true } },
    },
  });

  if (!product) return res.status(404).json({ error: "That product no longer exists" });

  const quotationCount = await req.db.quotation.count({
    where: { status: { in: LIVE_STATUSES }, lines: { some: { productId: product.id } } },
  });

  res.json({
    counts: { quotations: quotationCount, warehouses: product.stocks.length },
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      category: product.category.name,
      categoryCeilingPct: product.category.discountCeilingPct,
      unit: product.unit,
      description: product.description,
      salesPrice: product.salesPrice,
      cost: product.cost,
      marginPct: marginPct(product.salesPrice, product.cost),
      taxRatePct: product.taxRatePct,
      defaultBillingType: product.defaultBillingType,
      defaultPlanId: product.defaultPlanId,
      defaultPlan: product.defaultPlan ? product.defaultPlan.name : null,
      isStockable: product.isStockable,
      isPromoted: product.isPromoted,
      warrantyMonths: product.warrantyMonths,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        attribute: variant.attribute,
        value: variant.value,
        extraPrice: variant.extraPrice,
      })),
      priceLists: product.priceListItems.map((item) => ({
        id: item.id,
        name: item.priceList.name,
        tier: item.priceList.tier ? item.priceList.tier.name : "All tiers",
        price: item.price,
      })),
      stock: product.stocks.map((row) => ({
        id: row.id,
        warehouse: row.warehouse.name,
        qty: row.qty,
      })),
    },
  });
});

catalogueRouter.get("/customers", async (req, res) => {
  const search = req.query.q ? String(req.query.q).trim() : "";

  const customers = await req.db.customer.findMany({
    where: {
      isActive: true,
      ...(search
        ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
        : {}),
    },
    include: { tier: true },
    orderBy: { name: "asc" },
    ...(req.query.limit ? { take: searchLimit(req.query.limit) } : {}),
  });

  res.json({
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      city: customer.city,
      tierId: customer.tierId,
      tier: customer.tier.name,
      maxDiscountPct: customer.tier.maxDiscountPct,
    })),
  });
});

catalogueRouter.get("/customers/:id", async (req, res) => {
  const customer = await req.db.customer.findUnique({
    where: { id: Number(req.params.id) },
    include: { tier: true },
  });

  if (!customer) return res.status(404).json({ error: "That customer no longer exists" });

  const quotations = await req.db.quotation.findMany({
    where: { customerId: customer.id },
    include: QUOTATION_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // The list above is capped, so the buttons count in the database instead.
  // Open and orders are disjoint, so the two numbers never cover the same deal.
  const [openCount, orderCount] = await Promise.all([
    req.db.quotation.count({
      where: { customerId: customer.id, status: { in: OPEN_STATUSES } },
    }),
    req.db.quotation.count({
      where: { customerId: customer.id, status: QUOTATION_STATUS.CONFIRMED },
    }),
  ]);

  const billing = await billingCounts(req.db, { customerId: customer.id });

  res.json({
    counts: { open: openCount, orders: orderCount, ...billing },
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      city: customer.city,
      state: customer.state,
      tier: customer.tier.name,
      maxDiscountPct: customer.tier.maxDiscountPct,
      createdAt: customer.createdAt,
    },
    quotations: quotations.map(quotationSummary),
  });
});

catalogueRouter.get("/plans", async (req, res) => {
  const plans = await req.db.recurringPlan.findMany({ orderBy: { name: "asc" } });
  res.json({ plans: plans.map((plan) => ({ id: plan.id, name: plan.name })) });
});

// The ceilings, for pickers. Editing them is admin work and lives under
// /config; reading them is needed anywhere a customer's tier is chosen.
catalogueRouter.get("/tiers", async (req, res) => {
  const tiers = await req.db.tier.findMany({ orderBy: { sequence: "asc" } });

  res.json({
    tiers: tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      maxDiscountPct: tier.maxDiscountPct,
    })),
  });
});

catalogueRouter.get("/categories", async (req, res) => {
  const categories = await req.db.category.findMany({ orderBy: { name: "asc" } });

  res.json({
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      discountCeilingPct: category.discountCeilingPct,
    })),
  });
});

// --- create a product -------------------------------------------------------

// isStockable is the goods / service split: goods are counted in a warehouse
// and can run short, a service never is. How it is charged is a separate
// question, answered by defaultBillingType.
const productSchema = z.object({
  name: z.string().trim().min(2, "Give the product a name"),
  sku: z.string().trim().min(2, "Give the product an SKU"),
  categoryId: z.number().int().positive("Choose a category"),
  unit: z.string().trim().min(1).default("unit"),
  salesPrice: z.number().nonnegative("Sales price cannot be negative"),
  cost: z.number().nonnegative("Cost cannot be negative"),
  taxRatePct: z.number().min(0).max(100).default(18),
  isStockable: z.boolean().default(true),
  defaultBillingType: z.enum([BILLING_TYPE.ONE_TIME, BILLING_TYPE.RECURRING]).default(BILLING_TYPE.ONE_TIME),
  defaultPlanId: z.string().nullable().optional(),
  warrantyMonths: z.number().int().min(0).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});

// Master data carries cost and margin, so only an admin may add to it.
catalogueRouter.post("/products", requireRole(ROLES.ADMIN), async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const input = parsed.data;

  const category = await req.db.category.findUnique({ where: { id: input.categoryId } });
  if (!category) return res.status(400).json({ error: "That category no longer exists" });

  const clash = await req.db.product.findUnique({ where: { sku: input.sku } });
  if (clash) return res.status(409).json({ error: `SKU ${input.sku} is already in use` });

  // A one-time product has no billing period to keep.
  const planId = input.defaultBillingType === BILLING_TYPE.RECURRING ? input.defaultPlanId || "MONTHLY" : null;

  if (planId) {
    const plan = await req.db.recurringPlan.findUnique({ where: { id: planId } });
    if (!plan) return res.status(400).json({ error: "Choose a billing period" });
  }

  const product = await req.db.product.create({
    data: {
      name: input.name,
      sku: input.sku,
      categoryId: input.categoryId,
      unit: input.unit,
      salesPrice: input.salesPrice,
      cost: input.cost,
      taxRatePct: input.taxRatePct,
      isStockable: input.isStockable,
      defaultBillingType: input.defaultBillingType,
      defaultPlanId: planId,
      warrantyMonths: input.warrantyMonths ?? null,
      description: input.description || null,
    },
  });

  res.status(201).json({ id: product.id, name: product.name, sku: product.sku });
});

catalogueRouter.patch("/products/:id", requireRole(ROLES.ADMIN), async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const id = Number(req.params.id);
  const existing = await req.db.product.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "That product no longer exists" });

  const input = parsed.data;

  const category = await req.db.category.findUnique({ where: { id: input.categoryId } });
  if (!category) return res.status(400).json({ error: "That category no longer exists" });

  if (input.sku !== existing.sku) {
    const clash = await req.db.product.findUnique({ where: { sku: input.sku } });
    if (clash) return res.status(409).json({ error: `SKU ${input.sku} is already in use` });
  }

  const planId =
    input.defaultBillingType === BILLING_TYPE.RECURRING ? input.defaultPlanId || "MONTHLY" : null;

  if (planId) {
    const plan = await req.db.recurringPlan.findUnique({ where: { id: planId } });
    if (!plan) return res.status(400).json({ error: "Choose a billing period" });
  }

  await req.db.product.update({
    where: { id },
    data: {
      name: input.name,
      sku: input.sku,
      categoryId: input.categoryId,
      unit: input.unit,
      salesPrice: input.salesPrice,
      cost: input.cost,
      taxRatePct: input.taxRatePct,
      isStockable: input.isStockable,
      defaultBillingType: input.defaultBillingType,
      defaultPlanId: planId,
      warrantyMonths: input.warrantyMonths ?? null,
      description: input.description || null,
    },
  });

  await logEvent(req.db, {
    userId: req.user.id,
    action: "CONFIG_CHANGED",
    detail: `Changed product ${input.sku} (${input.name})`,
  });

  res.json({ ok: true });
});

// --- variants ---------------------------------------------------------------

const variantSchema = z.object({
  attribute: z.string().trim().min(1, "Give the variant an attribute, such as Size or Pack"),
  value: z.string().trim().min(1, "Give the variant a value"),
  extraPrice: z.number().min(0, "Extra price cannot be negative").default(0),
});

catalogueRouter.post("/products/:id/variants", requireRole(ROLES.ADMIN), async (req, res) => {
  const parsed = variantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const product = await req.db.product.findUnique({ where: { id: Number(req.params.id) } });
  if (!product) return res.status(404).json({ error: "That product no longer exists" });

  const clash = await req.db.productVariant.findFirst({
    where: {
      productId: product.id,
      attribute: parsed.data.attribute,
      value: parsed.data.value,
    },
  });
  if (clash) {
    return res.status(409).json({
      error: `${parsed.data.attribute}: ${parsed.data.value} is already on this product`,
    });
  }

  const variant = await req.db.productVariant.create({
    data: { productId: product.id, ...parsed.data },
  });

  res.status(201).json({
    id: variant.id,
    attribute: variant.attribute,
    value: variant.value,
    extraPrice: variant.extraPrice,
  });
});

catalogueRouter.delete("/products/:id/variants/:variantId", requireRole(ROLES.ADMIN), async (req, res) => {
  const variant = await req.db.productVariant.findFirst({
    where: { id: Number(req.params.variantId), productId: Number(req.params.id) },
  });
  if (!variant) return res.status(404).json({ error: "That variant no longer exists" });

  await req.db.productVariant.delete({ where: { id: variant.id } });
  res.json({ ok: true });
});

// --- create and edit a customer ---------------------------------------------

const customerSchema = z.object({
  name: z.string().trim().min(2, "Give the customer a name"),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z.string().trim().max(40).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().max(80).optional().nullable(),
  tierId: z.string().min(1, "Choose a tier"),
  isActive: z.boolean().default(true),
});

function nullBlanks(values) {
  const data = { ...values };
  for (const key of ["phone", "city", "state"]) {
    if (data[key] !== undefined && (data[key] === null || data[key].trim() === "")) data[key] = null;
  }
  return data;
}

// A tier is the customer's discount ceiling, so adding a customer is setting
// policy about them. Admin and sales manager only.
const CUSTOMER_EDIT_ROLES = [ROLES.ADMIN, ROLES.SALES_MANAGER];

catalogueRouter.post("/customers", requireRole(...CUSTOMER_EDIT_ROLES), async (req, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const clash = await req.db.customer.findUnique({ where: { email: parsed.data.email } });
  if (clash) {
    return res.status(409).json({ error: `${parsed.data.email} is already on another customer` });
  }

  const tier = await req.db.tier.findUnique({ where: { id: parsed.data.tierId } });
  if (!tier) return res.status(400).json({ error: "That tier no longer exists" });

  const customer = await req.db.customer.create({ data: nullBlanks(parsed.data) });

  res.status(201).json({ id: customer.id, name: customer.name });
});

catalogueRouter.patch("/customers/:id", requireRole(...CUSTOMER_EDIT_ROLES), async (req, res) => {
  const parsed = customerSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const id = Number(req.params.id);
  const existing = await req.db.customer.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "That customer no longer exists" });

  if (parsed.data.email && parsed.data.email !== existing.email) {
    const clash = await req.db.customer.findUnique({ where: { email: parsed.data.email } });
    if (clash) {
      return res.status(409).json({ error: `${parsed.data.email} is already on another customer` });
    }
  }

  if (parsed.data.tierId && parsed.data.tierId !== existing.tierId) {
    const tier = await req.db.tier.findUnique({ where: { id: parsed.data.tierId } });
    if (!tier) return res.status(400).json({ error: "That tier no longer exists" });

    // A ceiling change is policy about this customer, so it is on the record
    // rather than only in the row's new value.
    await logEvent(req.db, {
      userId: req.user.id,
      action: "CUSTOMER_TIER_CHANGED",
      detail: `${existing.name} moved from ${existing.tierId} to ${tier.name} (ceiling now ${tier.maxDiscountPct}%)`,
    });
  }

  const customer = await req.db.customer.update({ where: { id }, data: nullBlanks(parsed.data) });

  res.json({ id: customer.id });
});
