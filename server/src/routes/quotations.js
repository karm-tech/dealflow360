import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { INTERNAL_ROLES, ROLES, QUOTATION_STATUS, BILLING_TYPE } from "../lib/constants.js";
import { logActivity, describeChange } from "../lib/activity.js";
import {
  isEditable,
  editBlockedMessage,
  resolveConfirmTarget,
  previewRouting,
  statusAfterConfirm,
} from "../lib/quotationRules.js";
import { deliverToCustomer, deliveryMessage } from "../lib/quotationDelivery.js";
import { QUOTATION_INCLUDE, quotationDetail, quotationSummary } from "../lib/quotationView.js";
import { nextQuotationNumber } from "../lib/quotationNumber.js";
import { priceForTier } from "../lib/pricing.js";
import { applyVariantPrice } from "../lib/variants.js";
import {
  checkRenewalLeadDays,
  defaultRenewalLeadDays,
  maxRenewalLeadDays,
} from "../lib/renewal.js";
import { suggestUpsells, addDismissed } from "../lib/upsell.js";
import { notify, usersInRole, NOTIFICATION_TYPES } from "../lib/notify.js";
import { executeFulfilment, suggestFulfilment } from "../lib/fulfilmentService.js";
import { billConfirmedOrder, billingCounts } from "../lib/billingService.js";
import { acceptQuotation } from "../lib/acceptance.js";
import { postQuotationMessage } from "../lib/quotationThread.js";

export const quotationsRouter = Router();

// Tells everyone who can take the step that it is waiting for them.
async function notifyStepPending(req, quotation, step, score) {
  const approvers = await usersInRole(req.db, step.role, quotation.repId);

  await notify(req.db, req.dbMode, {
    users: approvers,
    type: NOTIFICATION_TYPES.APPROVAL_REQUESTED,
    title: `${quotation.number} needs your approval`,
    body: `${quotation.customer.name} · discount risk ${score} points`,
    quotationId: quotation.id,
  });
}

quotationsRouter.use(requireAuth, requireRole(...INTERNAL_ROLES));

// --- validation -------------------------------------------------------------

const createSchema = z.object({
  customerId: z.number().int().positive("Choose a customer"),
  requestedDeliveryDate: z.string().optional().nullable(),
});

const headerSchema = z.object({
  customerId: z.number().int().positive().optional(),
  inquiryDate: z.string().nullable().optional(),
  requestedDeliveryDate: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const bulkDiscountSchema = z.object({
  discountPct: z.number().min(0, "Discount cannot be negative").max(100, "Discount cannot be over 100%"),
});

const lineSchema = z.object({
  productId: z.number().int().positive("Choose a product"),
  variantId: z.number().int().positive().nullable().optional(),
  qty: z.number().int().min(1, "Quantity must be at least 1").optional(),
  discountPct: z.number().min(0, "Discount cannot be negative").max(100, "Discount cannot be over 100%").optional(),
  billingType: z.enum([BILLING_TYPE.ONE_TIME, BILLING_TYPE.RECURRING]).optional(),
  planId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  // Checked against the plan's period once that is known, not here.
  renewalLeadDays: z.number().int().min(1, "Renewal notice must be at least 1 day").optional(),
});

const lineUpdateSchema = lineSchema.partial().omit({ productId: true, variantId: true });

function firstIssue(parsed) {
  return parsed.error.issues[0].message;
}

// A delivery date in the past cannot be met, so it is rejected rather than
// quietly accepted.
function parseRequestedDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { error: "That delivery date is not valid" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) return { error: "The requested delivery date cannot be in the past" };

  return { date };
}

// The inquiry is a record of something that already happened, so it may be in
// the past but not in the future.
function parseInquiryDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { error: "That inquiry date is not valid" };

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (date > today) return { error: "The inquiry date cannot be in the future" };

  return { date };
}

// --- helpers ----------------------------------------------------------------

async function loadQuotation(db, id) {
  return db.quotation.findUnique({ where: { id }, include: QUOTATION_INCLUDE });
}

async function loadHistory(db, quotationId) {
  return db.activityLog.findMany({
    where: { quotationId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

// Price for this customer, captured onto the line at the moment it is added.
async function priceForCustomer(db, productId, tierId, variantId) {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      priceListItems: { include: { priceList: true } },
      defaultPlan: true,
      variants: true,
    },
  });

  if (!product || !product.isActive) return null;

  const basePrice = priceForTier(product, tierId);

  if (product.variants.length > 0 && !variantId) {
    return { error: "Choose a variant for this product" };
  }

  let variant = null;
  if (variantId) {
    variant = product.variants.find((row) => row.id === variantId) || null;
    if (!variant) return { error: "That variant does not belong to this product" };
  }

  return { product, variant, unitPrice: applyVariantPrice(basePrice, variant) };
}

// Two lines are the same line when everything that decides what is charged
// matches. A different discount, billing type, plan or start date is a real
// reason to sell the same product twice on one order, so those stay apart.
function sameDay(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function matchingLine(lines, candidate) {
  return lines.find(
    (line) =>
      line.productId === candidate.productId &&
      (line.variantId || null) === (candidate.variantId || null) &&
      line.discountPct === candidate.discountPct &&
      line.billingType === candidate.billingType &&
      (line.planId || null) === (candidate.planId || null) &&
      sameDay(line.startDate, candidate.startDate),
  );
}

// Refuses the change unless the quotation is open for edits. The button is
// hidden in the browser as well, but this is the rule.
function guardEditable(quotation, res) {
  if (!isEditable(quotation.status)) {
    res.status(409).json({ error: editBlockedMessage(quotation.status) });
    return false;
  }
  return true;
}

// `outcome` describes what an action did, for screens that cannot show it —
// a merged line or a discount written across lines that are not all on screen.
async function respondWithDetail(req, res, quotationId, outcome = null) {
  const quotation = await loadQuotation(req.db, quotationId);
  const [history, suggestions] = await Promise.all([
    loadHistory(req.db, quotationId),
    suggestUpsells(req.db, quotation),
  ]);

  // An open draft shows what confirming would do, using the same routing the
  // confirm runs, so the preview cannot drift from the decision.
  const routing = isEditable(quotation.status) ? await previewRouting(req.db, quotation) : null;
  const billing = await billingCounts(req.db, { quotationId });

  res.json({
    quotation: quotationDetail(quotation, {
      role: req.user.role,
      activityLogs: history,
      suggestions,
      routing,
      billing,
    }),
    ...(outcome || {}),
  });
}

// --- list and detail --------------------------------------------------------

// Annual value is worked out per row rather than stored, so ordering happens
// after the rows are shaped.
const SORTS = {
  newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  value: (a, b) => b.annualContractValue - a.annualContractValue,
  customer: (a, b) => a.customer.name.localeCompare(b.customer.name),
};

// One ordered list for both the table and the pager, so stepping through
// records follows exactly what the user is looking at.
async function listQuotations(db, query) {
  const { status, customerId, productId, repId, search, sort } = query;

  const where = {};
  // Comma separated so a smart button can ask for a group of stages at once.
  if (status) {
    const wanted = String(status).split(",").filter(Boolean);
    where.status = wanted.length > 1 ? { in: wanted } : wanted[0];
  }
  if (customerId) where.customerId = Number(customerId);
  // Quotations containing a given product, for the smart button on its record.
  if (productId) where.lines = { some: { productId: Number(productId) } };
  if (repId) where.repId = Number(repId);
  if (search) {
    where.OR = [
      { number: { contains: String(search) } },
      { customer: { name: { contains: String(search) } } },
    ];
  }

  const quotations = await db.quotation.findMany({ where, include: QUOTATION_INCLUDE });
  return quotations.map(quotationSummary).sort(SORTS[sort] || SORTS.newest);
}

quotationsRouter.get("/", async (req, res) => {
  res.json({ quotations: await listQuotations(req.db, req.query) });
});

// Where this record sits in the filtered list, and what is either side of it.
quotationsRouter.get("/:id/neighbours", async (req, res) => {
  const rows = await listQuotations(req.db, req.query);
  const index = rows.findIndex((row) => row.id === Number(req.params.id));

  if (index === -1) return res.json({ prevId: null, nextId: null, position: null, total: rows.length });

  res.json({
    prevId: index > 0 ? rows[index - 1].id : null,
    nextId: index < rows.length - 1 ? rows[index + 1].id : null,
    position: index + 1,
    total: rows.length,
  });
});

quotationsRouter.get("/:id", async (req, res) => {
  const quotation = await loadQuotation(req.db, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  await respondWithDetail(req, res, quotation.id);
});

// --- create, update, delete -------------------------------------------------

quotationsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const customer = await req.db.customer.findUnique({ where: { id: parsed.data.customerId } });
  if (!customer) return res.status(404).json({ error: "That customer no longer exists" });

  const requested = parseRequestedDate(parsed.data.requestedDeliveryDate);
  if (requested?.error) return res.status(400).json({ error: requested.error });

  const quotation = await req.db.quotation.create({
    data: {
      number: await nextQuotationNumber(req.db),
      customerId: customer.id,
      repId: req.user.id,
      status: QUOTATION_STATUS.DRAFT,
      inquiryDate: new Date(),
      requestedDeliveryDate: requested?.date || null,
    },
  });

  await logActivity(req.db, {
    quotationId: quotation.id,
    userId: req.user.id,
    action: "QUOTATION_CREATED",
    detail: `Quotation ${quotation.number} created for ${customer.name}`,
  });

  res.status(201).json({ id: quotation.id, number: quotation.number });
});

quotationsRouter.patch("/:id", async (req, res) => {
  const parsed = headerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const quotation = await loadQuotation(req.db, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });
  if (!guardEditable(quotation, res)) return;

  const data = {};
  const changes = [];

  if (parsed.data.customerId && parsed.data.customerId !== quotation.customerId) {
    const customer = await req.db.customer.findUnique({ where: { id: parsed.data.customerId } });
    if (!customer) return res.status(404).json({ error: "That customer no longer exists" });
    data.customerId = customer.id;
    changes.push(describeChange("Customer", quotation.customer.name, customer.name));
  }

  if (parsed.data.requestedDeliveryDate !== undefined) {
    const requested = parseRequestedDate(parsed.data.requestedDeliveryDate);
    if (requested?.error) return res.status(400).json({ error: requested.error });
    data.requestedDeliveryDate = requested?.date || null;
    changes.push(
      describeChange(
        "Requested delivery",
        quotation.requestedDeliveryDate?.toDateString(),
        requested?.date?.toDateString(),
      ),
    );
  }

  if (parsed.data.inquiryDate !== undefined) {
    const inquiry = parseInquiryDate(parsed.data.inquiryDate);
    if (inquiry?.error) return res.status(400).json({ error: inquiry.error });
    data.inquiryDate = inquiry?.date || null;
    changes.push(
      describeChange(
        "Inquiry date",
        quotation.inquiryDate?.toDateString(),
        inquiry?.date?.toDateString(),
      ),
    );
  }

  if (parsed.data.notes !== undefined) {
    data.notes = parsed.data.notes;
  }

  await req.db.quotation.update({ where: { id: quotation.id }, data });

  if (changes.length > 0) {
    await logActivity(req.db, {
      quotationId: quotation.id,
      userId: req.user.id,
      action: "QUOTATION_UPDATED",
      detail: changes.join(" · "),
    });
  }

  await respondWithDetail(req, res, quotation.id);
});

// A rep may remove their own draft; managers and admins may remove any.
quotationsRouter.delete("/:id", async (req, res) => {
  const quotation = await req.db.quotation.findUnique({ where: { id: Number(req.params.id) } });
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  const isPrivileged = [ROLES.ADMIN, ROLES.SALES_MANAGER].includes(req.user.role);
  const isOwnDraft = quotation.repId === req.user.id && quotation.status === QUOTATION_STATUS.DRAFT;

  if (!isPrivileged && !isOwnDraft) {
    return res.status(403).json({ error: "You can only delete your own draft quotations" });
  }
  if (quotation.status === QUOTATION_STATUS.CONFIRMED) {
    return res.status(409).json({ error: "A confirmed order cannot be deleted" });
  }

  await req.db.quotation.delete({ where: { id: quotation.id } });

  await req.db.activityLog.create({
    data: {
      userId: req.user.id,
      action: "QUOTATION_DELETED",
      detail: `Deleted quotation ${quotation.number}`,
    },
  });

  res.json({ ok: true });
});

// Copies the deal as a fresh draft. Status, history and dates are not carried
// over: only what was being sold.
quotationsRouter.post("/:id/duplicate", async (req, res) => {
  const source = await loadQuotation(req.db, Number(req.params.id));
  if (!source) return res.status(404).json({ error: "That quotation no longer exists" });

  const copy = await req.db.quotation.create({
    data: {
      number: await nextQuotationNumber(req.db),
      customerId: source.customerId,
      repId: req.user.id,
      status: QUOTATION_STATUS.DRAFT,
      inquiryDate: new Date(),
      notes: source.notes,
      lines: {
        create: source.lines.map((line) => ({
          productId: line.productId,
          variantId: line.variantId,
          qty: line.qty,
          unitPrice: line.unitPrice,
          discountPct: line.discountPct,
          billingType: line.billingType,
          planId: line.planId,
          startDate: line.startDate,
          renewalLeadDays: line.renewalLeadDays,
        })),
      },
    },
  });

  await logActivity(req.db, {
    quotationId: copy.id,
    userId: req.user.id,
    action: "QUOTATION_DUPLICATED",
    detail: `Copied from ${source.number}`,
  });

  res.status(201).json({ id: copy.id, number: copy.number });
});

// --- lines ------------------------------------------------------------------

quotationsRouter.post("/:id/lines", async (req, res) => {
  const parsed = lineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const quotation = await loadQuotation(req.db, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });
  if (!guardEditable(quotation, res)) return;

  const resolved = await priceForCustomer(
    req.db,
    parsed.data.productId,
    quotation.customer.tierId,
    parsed.data.variantId,
  );
  if (!resolved) return res.status(404).json({ error: "That product is not available" });
  if (resolved.error) return res.status(400).json({ error: resolved.error });

  const { product, variant, unitPrice } = resolved;
  const billingType = parsed.data.billingType || product.defaultBillingType;
  const isRecurring = billingType === BILLING_TYPE.RECURRING;
  const qty = parsed.data.qty ?? 1;

  const candidate = {
    productId: product.id,
    variantId: variant ? variant.id : null,
    discountPct: parsed.data.discountPct ?? 0,
    billingType,
    planId: isRecurring ? parsed.data.planId || product.defaultPlanId || "MONTHLY" : null,
    startDate: isRecurring
      ? parsed.data.startDate
        ? new Date(parsed.data.startDate)
        : new Date()
      : null,
  };

  // A recurring line carries its own renewal notice; the plan decides what a
  // sensible default is and how long the notice may be.
  let renewalLeadDays = null;
  if (isRecurring) {
    const plan = await req.db.recurringPlan.findUnique({ where: { id: candidate.planId } });
    if (!plan) return res.status(400).json({ error: "Choose a billing period" });

    renewalLeadDays = parsed.data.renewalLeadDays ?? defaultRenewalLeadDays(plan);
    const problem = checkRenewalLeadDays(renewalLeadDays, plan);
    if (problem) return res.status(400).json({ error: problem });
  }

  // Adding what is already on the order raises its quantity instead of
  // repeating the row.
  const existing = matchingLine(quotation.lines, candidate);

  if (existing) {
    const newQty = existing.qty + qty;
    await req.db.quotationLine.update({ where: { id: existing.id }, data: { qty: newQty } });

    await logActivity(req.db, {
      quotationId: quotation.id,
      userId: req.user.id,
      action: "LINE_UPDATED",
      detail: describeChange(`${product.name} quantity`, existing.qty, newQty),
    });

    return respondWithDetail(req, res, quotation.id, {
      merged: true,
      message: `Added ${qty} to ${product.name} — now ${newQty}`,
    });
  }

  await req.db.quotationLine.create({
    data: { quotationId: quotation.id, unitPrice, qty, ...candidate, renewalLeadDays },
  });

  await logActivity(req.db, {
    quotationId: quotation.id,
    userId: req.user.id,
    action: "LINE_ADDED",
    detail: `Added ${product.name} × ${qty}`,
  });

  await respondWithDetail(req, res, quotation.id, {
    message: `${product.name} × ${qty} added`,
  });
});

// A blanket discount is written onto every line, so each line still carries the
// one figure that is charged.
quotationsRouter.post("/:id/lines/discount", async (req, res) => {
  const parsed = bulkDiscountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const quotation = await loadQuotation(req.db, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });
  if (!guardEditable(quotation, res)) return;

  if (quotation.lines.length === 0) {
    return res.status(400).json({ error: "There are no lines to discount" });
  }

  const { discountPct } = parsed.data;
  const previous = quotation.lines.map((line) => `${line.discountPct}%`).join(", ");

  await req.db.quotationLine.updateMany({
    where: { quotationId: quotation.id },
    data: { discountPct },
  });

  await logActivity(req.db, {
    quotationId: quotation.id,
    userId: req.user.id,
    action: "LINE_UPDATED",
    detail: `Discount set to ${discountPct}% on every line · was ${previous}`,
  });

  await respondWithDetail(req, res, quotation.id, {
    message: `${discountPct}% set on ${quotation.lines.length} ${
      quotation.lines.length === 1 ? "line" : "lines"
    }`,
  });
});

quotationsRouter.patch("/:id/lines/:lineId", async (req, res) => {
  const parsed = lineUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const quotation = await loadQuotation(req.db, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });
  if (!guardEditable(quotation, res)) return;

  const line = quotation.lines.find((row) => row.id === Number(req.params.lineId));
  if (!line) return res.status(404).json({ error: "That line is no longer on this quotation" });

  const data = {};
  const changes = [];

  if (parsed.data.qty !== undefined && parsed.data.qty !== line.qty) {
    data.qty = parsed.data.qty;
    changes.push(describeChange(`${line.product.name} quantity`, line.qty, parsed.data.qty));
  }

  if (parsed.data.discountPct !== undefined && parsed.data.discountPct !== line.discountPct) {
    data.discountPct = parsed.data.discountPct;
    changes.push(
      describeChange(`${line.product.name} discount`, `${line.discountPct}%`, `${parsed.data.discountPct}%`),
    );
  }

  if (parsed.data.billingType && parsed.data.billingType !== line.billingType) {
    const isRecurring = parsed.data.billingType === BILLING_TYPE.RECURRING;
    data.billingType = parsed.data.billingType;
    data.planId = isRecurring ? line.planId || line.product.defaultPlanId || "MONTHLY" : null;
    data.startDate = isRecurring ? line.startDate || new Date() : null;
    changes.push(describeChange(`${line.product.name} billing`, line.billingType, parsed.data.billingType));
  }

  if (parsed.data.planId !== undefined && line.billingType === BILLING_TYPE.RECURRING) {
    data.planId = parsed.data.planId;
  }

  if (parsed.data.startDate !== undefined) {
    data.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
  }

  // The notice has to fit whichever plan the line ends up on, so it is settled
  // after the other changes: a yearly line moved to monthly cannot keep 30
  // days' notice, and a line moved off recurring has nothing to renew.
  const nextBillingType = data.billingType || line.billingType;
  const nextPlanId = data.planId !== undefined ? data.planId : line.planId;

  if (nextBillingType !== BILLING_TYPE.RECURRING) {
    if (line.renewalLeadDays !== null) data.renewalLeadDays = null;
  } else {
    const plan = await req.db.recurringPlan.findUnique({ where: { id: nextPlanId } });
    if (!plan) return res.status(400).json({ error: "Choose a billing period" });

    if (parsed.data.renewalLeadDays !== undefined) {
      const problem = checkRenewalLeadDays(parsed.data.renewalLeadDays, plan);
      if (problem) return res.status(400).json({ error: problem });
    }

    const asked = parsed.data.renewalLeadDays ?? line.renewalLeadDays;
    const resolved =
      asked === null || asked === undefined
        ? defaultRenewalLeadDays(plan)
        : Math.min(asked, maxRenewalLeadDays(plan));

    if (resolved !== line.renewalLeadDays) {
      data.renewalLeadDays = resolved;
      changes.push(
        describeChange(
          `${line.product.name} renewal notice`,
          line.renewalLeadDays === null ? "none" : `${line.renewalLeadDays} days`,
          `${resolved} days`,
        ),
      );
    }
  }

  await req.db.quotationLine.update({ where: { id: line.id }, data });

  if (changes.length > 0) {
    await logActivity(req.db, {
      quotationId: quotation.id,
      userId: req.user.id,
      action: "LINE_UPDATED",
      detail: changes.join(" · "),
    });
  }

  await respondWithDetail(req, res, quotation.id);
});

quotationsRouter.delete("/:id/lines/:lineId", async (req, res) => {
  const quotation = await loadQuotation(req.db, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });
  if (!guardEditable(quotation, res)) return;

  const line = quotation.lines.find((row) => row.id === Number(req.params.lineId));
  if (!line) return res.status(404).json({ error: "That line is no longer on this quotation" });

  await req.db.quotationLine.delete({ where: { id: line.id } });

  await logActivity(req.db, {
    quotationId: quotation.id,
    userId: req.user.id,
    action: "LINE_REMOVED",
    detail: `Removed ${line.product.name}`,
  });

  await respondWithDetail(req, res, quotation.id);
});

// --- confirm ----------------------------------------------------------------

quotationsRouter.post("/:id/confirm", async (req, res) => {
  const quotation = await loadQuotation(req.db, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });
  if (!guardEditable(quotation, res)) return;

  if (quotation.lines.length === 0) {
    return res.status(400).json({ error: "Add at least one product before sending for approval" });
  }

  const plan = await resolveConfirmTarget(req.db, quotation);
  if (plan.error) return res.status(409).json({ error: plan.error });

  const nextStatus = statusAfterConfirm(plan.status, quotation.status);
  const needsApproval = nextStatus === QUOTATION_STATUS.PENDING_APPROVAL;
  const sendRevision = nextStatus === QUOTATION_STATUS.SENT;

  // A resubmitted quotation is scored again from scratch, so earlier steps are
  // cleared rather than added to.
  await req.db.approvalStep.deleteMany({ where: { quotationId: quotation.id } });

  await req.db.quotation.update({
    where: { id: quotation.id },
    data: {
      status: nextStatus,
      riskScore: plan.risk.score,
      requiresFinance: plan.requiresFinance,
      approvalPendingSince: needsApproval ? new Date() : null,
      approvalSteps: { create: plan.steps },
    },
  });

  await logActivity(req.db, {
    quotationId: quotation.id,
    userId: req.user.id,
    action: "QUOTATION_CONFIRMED",
    detail: `${describeChange("Status", quotation.status, nextStatus)} · risk ${plan.risk.score} points`,
  });

  if (needsApproval) {
    await notifyStepPending(req, quotation, plan.steps[0], plan.risk.score);
    await respondWithDetail(req, res, quotation.id);
    return;
  }

  // Inside its ceilings, so it is approved on the spot and the split is
  // worked out straight away.
  await suggestFulfilment(req.db, quotation.id);

  if (sendRevision) {
    const fresh = await loadQuotation(req.db, quotation.id);
    const result = await deliverToCustomer(req.db, req.dbMode, fresh, req.user.id, { isResend: true });
    await respondWithDetail(req, res, quotation.id, { message: deliveryMessage(result, quotation.customer) });
    return;
  }

  await respondWithDetail(req, res, quotation.id);
});

// --- send to the customer ---------------------------------------------------

// Puts an approved quotation in front of the customer and waits. Until this
// runs the customer has seen nothing, so it is the step that makes the portal's
// approve and reject buttons appear.
quotationsRouter.post("/:id/send", async (req, res) => {
  const quotation = await loadQuotation(req.db, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  // Re-sending an already sent quotation is allowed: a customer loses the mail.
  const sendable = [QUOTATION_STATUS.APPROVED, QUOTATION_STATUS.SENT];
  if (!sendable.includes(quotation.status)) {
    return res.status(409).json({ error: "Only an approved quotation can be sent to the customer" });
  }

  const isResend = quotation.status === QUOTATION_STATUS.SENT;

  if (!isResend) {
    await req.db.quotation.update({
      where: { id: quotation.id },
      data: { status: QUOTATION_STATUS.SENT },
    });
  }

  const fresh = await loadQuotation(req.db, quotation.id);
  const result = await deliverToCustomer(req.db, req.dbMode, fresh, req.user.id, { isResend });

  await respondWithDetail(req, res, quotation.id, {
    message: deliveryMessage(result, quotation.customer),
  });
});

// --- accept -----------------------------------------------------------------

// Records that the customer agreed away from the portal. The portal's own
// approve button runs the same cascade.
quotationsRouter.post("/:id/accept", async (req, res) => {
  const quotation = await loadQuotation(req.db, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  const result = await acceptQuotation(
    req.db,
    req.dbMode,
    quotation,
    req.user.id,
    `recorded by ${req.user.name || "a colleague"}`,
  );
  if (result.error) return res.status(409).json({ error: result.error });

  await respondWithDetail(req, res, quotation.id);
});

// --- suggestions ------------------------------------------------------------

quotationsRouter.post("/:id/suggestions/:productId/dismiss", async (req, res) => {
  const quotation = await req.db.quotation.findUnique({ where: { id: Number(req.params.id) } });
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });
  if (!guardEditable(quotation, res)) return;

  await req.db.quotation.update({
    where: { id: quotation.id },
    data: { dismissedUpsellIds: addDismissed(quotation.dismissedUpsellIds, Number(req.params.productId)) },
  });

  await respondWithDetail(req, res, quotation.id);
});

const messageSchema = z.object({
  text: z.string().trim().min(1, "Write a message first.").max(2000),
});

quotationsRouter.post("/:id/messages", async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });

  const quotation = await loadQuotation(req.db, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  const result = await postQuotationMessage(req.db, req.dbMode, {
    quotation,
    authorId: req.user.id,
    text: parsed.data.text,
  });
  if (result.error) return res.status(409).json({ error: result.error });

  await respondWithDetail(req, res, quotation.id, { message: "Message sent" });
});
