// Everything a customer can reach. Separate from the staff routers rather than
// role checks sprinkled through them, because the rule here is not "which role"
// but "whose records": every query in this file is filtered to the customer the
// signed-in user belongs to, so there is one place to check that it is.

import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { BILLING_TYPE, QUOTATION_STATUS, ROLES } from "../lib/constants.js";
import { priceForTier } from "../lib/pricing.js";
import { applyVariantPrice } from "../lib/variants.js";
import { quotationDetail, quotationSummary, QUOTATION_INCLUDE } from "../lib/quotationView.js";
import { nextQuotationNumber } from "../lib/quotationNumber.js";
import { defaultRenewalLeadDays } from "../lib/renewal.js";
import { portalHistory } from "../lib/portalHistory.js";
import { logActivity } from "../lib/activity.js";
import { acceptQuotation } from "../lib/acceptance.js";
import { notify, NOTIFICATION_TYPES } from "../lib/notify.js";

export const portalRouter = Router();

portalRouter.use(requireAuth, requireRole(ROLES.CUSTOMER));

// A portal login with no company attached could not be scoped to anything, so
// it is refused outright rather than allowed through to an empty screen.
portalRouter.use((req, res, next) => {
  if (!req.user.customerId) {
    return res.status(403).json({ error: "This account is not linked to a company yet" });
  }
  next();
});

// --- account ----------------------------------------------------------------

portalRouter.get("/me", async (req, res) => {
  const customer = await req.db.customer.findUnique({
    where: { id: req.user.customerId },
    include: { tier: true },
  });

  if (!customer) return res.status(404).json({ error: "Your company record is missing" });

  res.json({
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      city: customer.city,
      tier: customer.tier.name,
    },
  });
});

// --- catalogue --------------------------------------------------------------

// Deliberately narrower than the staff catalogue, which carries cost, margin,
// per-warehouse stock and the discount ceiling. None of that is shaped here, so
// it cannot escape by someone later widening a shared response.
portalRouter.get("/products", async (req, res) => {
  const search = req.query.q ? String(req.query.q).trim() : "";
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;

  const customer = await req.db.customer.findUnique({ where: { id: req.user.customerId } });
  if (!customer) return res.status(404).json({ error: "Your company record is missing" });

  const products = await req.db.product.findMany({
    where: {
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { OR: [{ name: { contains: search } }, { sku: { contains: search } }] } : {}),
    },
    include: {
      category: true,
      priceListItems: { include: { priceList: true } },
      defaultPlan: true,
      variants: { orderBy: [{ attribute: "asc" }, { extraPrice: "asc" }] },
    },
    orderBy: [{ categoryId: "asc" }, { name: "asc" }],
  });

  res.json({
    products: products.map((product) => {
      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category.name,
        categoryId: product.categoryId,
        unit: product.unit,
        price: priceForTier(product, customer.tierId),
        taxRatePct: product.taxRatePct,
        billingType: product.defaultBillingType,
        planName: product.defaultPlan ? product.defaultPlan.name : null,
        isStockable: product.isStockable,
        description: product.description,
        variants: product.variants.map((variant) => ({
          id: variant.id,
          attribute: variant.attribute,
          value: variant.value,
          extraPrice: variant.extraPrice,
        })),
      };
    }),
  });
});

portalRouter.get("/categories", async (req, res) => {
  const categories = await req.db.category.findMany({ orderBy: { name: "asc" } });
  res.json({ categories: categories.map(({ id, name }) => ({ id, name })) });
});

// --- requesting a quotation -------------------------------------------------

const requestSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        variantId: z.number().int().positive().nullable().optional(),
        qty: z.number().int().min(1, "Quantity must be at least 1"),
      }),
    )
    .min(1, "Add at least one product before sending your request"),
  notes: z.string().trim().max(2000).optional(),
});

// Who picks the request up. Configured in the admin's portal settings; if
// nobody is named it falls to any rep, because an unowned request is one that
// sits there.
async function portalRep(db) {
  const settings = await db.settings.findUnique({ where: { id: 1 } });

  if (settings?.portalSalesRepId) {
    const named = await db.user.findUnique({ where: { id: settings.portalSalesRepId } });
    if (named && named.status === "ACTIVE") return named;
  }

  return db.user.findFirst({
    where: { role: ROLES.SALES_REP, status: "ACTIVE" },
    orderBy: { id: "asc" },
  });
}

portalRouter.post("/requests", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const customer = await req.db.customer.findUnique({ where: { id: req.user.customerId } });
  if (!customer) return res.status(404).json({ error: "Your company record is missing" });

  const rep = await portalRep(req.db);
  if (!rep) {
    return res.status(503).json({
      error: "Nobody is available to take your request right now. Please try again shortly.",
    });
  }

  // Priced here rather than trusting anything the browser sent, so a basket
  // left open while a price changed still quotes the price in force now.
  const products = await req.db.product.findMany({
    where: { id: { in: parsed.data.lines.map((line) => line.productId) }, isActive: true },
    include: {
      priceListItems: { include: { priceList: true } },
      defaultPlan: true,
      variants: true,
    },
  });

  const byId = new Map(products.map((product) => [product.id, product]));
  const missing = parsed.data.lines.find((line) => !byId.has(line.productId));
  if (missing) {
    return res.status(400).json({ error: "One of those products is no longer available" });
  }

  const lines = [];
  for (const line of parsed.data.lines) {
    const product = byId.get(line.productId);
    const isRecurring = product.defaultBillingType === BILLING_TYPE.RECURRING;
    const plan = isRecurring ? product.defaultPlan : null;

    if (product.variants.length > 0 && !line.variantId) {
      return res.status(400).json({ error: `Choose a variant for ${product.name}` });
    }

    const variant = line.variantId
      ? product.variants.find((row) => row.id === line.variantId)
      : null;
    if (line.variantId && !variant) {
      return res.status(400).json({ error: `That variant is not available on ${product.name}` });
    }

    lines.push({
      productId: product.id,
      variantId: variant ? variant.id : null,
      qty: line.qty,
      unitPrice: applyVariantPrice(priceForTier(product, customer.tierId), variant),
      // A customer never asks for a discount here; the rep decides that.
      discountPct: 0,
      billingType: product.defaultBillingType,
      planId: plan ? plan.id : null,
      startDate: isRecurring ? new Date() : null,
      renewalLeadDays: plan ? defaultRenewalLeadDays(plan) : null,
    });
  }

  // It arrives as a draft, not as anything approved. The rep still prices it,
  // discounts it and puts it through the same approval the flow always uses.
  const quotation = await req.db.quotation.create({
    data: {
      number: await nextQuotationNumber(req.db),
      customerId: customer.id,
      repId: rep.id,
      status: QUOTATION_STATUS.DRAFT,
      inquiryDate: new Date(),
      lines: { create: lines },
    },
  });

  if (parsed.data.notes) {
    await req.db.portalMessage.create({
      data: { quotationId: quotation.id, authorId: req.user.id, text: parsed.data.notes },
    });
  }

  await logActivity(req.db, {
    quotationId: quotation.id,
    userId: req.user.id,
    action: "QUOTATION_CREATED",
    detail: `Requested from the portal by ${customer.name}`,
  });

  await notify(req.db, req.dbMode, {
    users: [rep],
    type: NOTIFICATION_TYPES.PORTAL_REQUEST,
    title: `${customer.name} requested quotation ${quotation.number}`,
    body: `${lines.length} ${lines.length === 1 ? "product" : "products"} requested through the portal. It is waiting as a draft for you to price.`,
    quotationId: quotation.id,
  });

  res.status(201).json({ id: quotation.id, number: quotation.number });
});

// --- their quotations -------------------------------------------------------

// A quotation nobody has sent them does not exist as far as the portal is
// concerned: a draft the rep is still writing is not theirs to read.
const VISIBLE_STATUSES = [
  QUOTATION_STATUS.DRAFT,
  QUOTATION_STATUS.PENDING_APPROVAL,
  QUOTATION_STATUS.APPROVED,
  QUOTATION_STATUS.SENT,
  QUOTATION_STATUS.UNDER_NEGOTIATION,
  QUOTATION_STATUS.CONFIRMED,
  QUOTATION_STATUS.REJECTED,
  QUOTATION_STATUS.CANCELLED,
];

// Before it is sent the customer sees that it is being worked on, not what it
// says: prices are still moving and the discount is not agreed.
const READABLE_STATUSES = [
  QUOTATION_STATUS.SENT,
  QUOTATION_STATUS.UNDER_NEGOTIATION,
  QUOTATION_STATUS.CONFIRMED,
  QUOTATION_STATUS.REJECTED,
];

// The stage names inside mean nothing to a customer, and some of them would
// give away how we work. This is the same deal described from their side.
const PORTAL_STATUS = {
  [QUOTATION_STATUS.DRAFT]: { label: "Being prepared", tone: "neutral" },
  [QUOTATION_STATUS.PENDING_APPROVAL]: { label: "Being prepared", tone: "neutral" },
  [QUOTATION_STATUS.APPROVED]: { label: "Being prepared", tone: "neutral" },
  [QUOTATION_STATUS.SENT]: { label: "Waiting for your decision", tone: "warn" },
  [QUOTATION_STATUS.UNDER_NEGOTIATION]: { label: "Being revised for you", tone: "warn" },
  [QUOTATION_STATUS.CONFIRMED]: { label: "Confirmed", tone: "ok" },
  [QUOTATION_STATUS.REJECTED]: { label: "You sent this back", tone: "bad" },
  [QUOTATION_STATUS.CANCELLED]: { label: "Withdrawn", tone: "bad" },
};

async function loadOwnQuotation(req, id) {
  const quotation = await req.db.quotation.findUnique({
    where: { id },
    include: QUOTATION_INCLUDE,
  });

  // Someone else's quotation is reported as missing rather than forbidden, so
  // the response cannot be used to discover that it exists.
  if (!quotation || quotation.customerId !== req.user.customerId) return null;
  if (!VISIBLE_STATUSES.includes(quotation.status)) return null;

  return quotation;
}

portalRouter.get("/quotations", async (req, res) => {
  const quotations = await req.db.quotation.findMany({
    where: { customerId: req.user.customerId, status: { in: VISIBLE_STATUSES } },
    include: QUOTATION_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  res.json({
    quotations: quotations.map((quotation) => {
      const summary = quotationSummary(quotation);
      const isReadable = READABLE_STATUSES.includes(quotation.status);

      return {
        id: summary.id,
        number: summary.number,
        lineCount: summary.lineCount,
        createdAt: summary.createdAt,
        ...PORTAL_STATUS[quotation.status],
        // Withheld while it is still being priced, so a figure the customer
        // saw early cannot be read as a promise.
        total: isReadable ? summary.grandTotal : null,
        needsDecision: quotation.status === QUOTATION_STATUS.SENT,
      };
    }),
  });
});

portalRouter.get("/quotations/:id", async (req, res) => {
  const quotation = await loadOwnQuotation(req, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  const logs = await req.db.activityLog.findMany({
    where: { quotationId: quotation.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Margin, risk and the approval chain are stripped by quotationDetail because
  // the role is not an internal one.
  const detail = quotationDetail(quotation, { role: req.user.role });
  const isReadable = READABLE_STATUSES.includes(quotation.status);

  res.json({
    quotation: {
      id: detail.id,
      number: detail.number,
      ...PORTAL_STATUS[quotation.status],
      createdAt: detail.createdAt,
      requestedDeliveryDate: detail.requestedDeliveryDate,
      rep: detail.rep ? detail.rep.name : null,
      canDecide: quotation.status === QUOTATION_STATUS.SENT,
      // Lines and figures appear only once it has been sent; until then the
      // customer is told it is being prepared and nothing more.
      isReadable,
      lines: isReadable ? detail.lines : [],
      totals: isReadable ? detail.totals : null,
      messages: detail.messages,
      history: portalHistory(logs),
    },
  });
});

// --- their decision ---------------------------------------------------------

portalRouter.post("/quotations/:id/approve", async (req, res) => {
  const quotation = await loadOwnQuotation(req, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  if (quotation.status !== QUOTATION_STATUS.SENT) {
    return res.status(409).json({ error: "This quotation is not waiting for your decision" });
  }

  // The same cascade a rep's "mark as accepted" runs: stock is taken, the
  // opening invoice is raised and any recurring line opens a subscription.
  const result = await acceptQuotation(
    req.db,
    req.dbMode,
    quotation,
    req.user.id,
    "approved by the customer in the portal",
  );
  if (result.error) return res.status(409).json({ error: result.error });

  res.json({ status: QUOTATION_STATUS.CONFIRMED });
});

const rejectSchema = z.object({
  reason: z.string().trim().min(5, "Please tell us why, so we can put it right"),
});

portalRouter.post("/quotations/:id/reject", async (req, res) => {
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const quotation = await loadOwnQuotation(req, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  if (quotation.status !== QUOTATION_STATUS.SENT) {
    return res.status(409).json({ error: "This quotation is not waiting for your decision" });
  }

  await req.db.quotation.update({
    where: { id: quotation.id },
    data: { status: QUOTATION_STATUS.REJECTED },
  });

  await req.db.portalMessage.create({
    data: { quotationId: quotation.id, authorId: req.user.id, text: parsed.data.reason },
  });

  await logActivity(req.db, {
    quotationId: quotation.id,
    userId: req.user.id,
    action: "QUOTATION_REJECTED_BY_CUSTOMER",
    detail: `${quotation.customer.name} turned it down: ${parsed.data.reason}`,
  });

  await notify(req.db, req.dbMode, {
    users: [quotation.rep],
    type: NOTIFICATION_TYPES.CUSTOMER_REJECTED,
    title: `${quotation.customer.name} turned down ${quotation.number}`,
    body: parsed.data.reason,
    quotationId: quotation.id,
  });

  res.json({ status: QUOTATION_STATUS.REJECTED });
});
