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
} from "../lib/quotationRules.js";
import { QUOTATION_INCLUDE, quotationDetail, quotationSummary } from "../lib/quotationView.js";
import { resolveUnitPrice } from "../lib/pricing.js";
import { suggestUpsells, addDismissed } from "../lib/upsell.js";
import { notify, usersInRole, NOTIFICATION_TYPES } from "../lib/notify.js";
import { executeFulfilment, suggestFulfilment } from "../lib/fulfilmentService.js";
import { billConfirmedOrder, billingCounts } from "../lib/billingService.js";

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
  qty: z.number().int().min(1, "Quantity must be at least 1").optional(),
  discountPct: z.number().min(0, "Discount cannot be negative").max(100, "Discount cannot be over 100%").optional(),
  billingType: z.enum([BILLING_TYPE.ONE_TIME, BILLING_TYPE.RECURRING]).optional(),
  planId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
});

const lineUpdateSchema = lineSchema.partial().omit({ productId: true });

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

// Numbers run in one sequence and never change: a quotation keeps its number
// when it becomes an order. Takes the highest number in use rather than the
// newest row, which need not be the highest.
async function nextNumber(db) {
  const rows = await db.quotation.findMany({ select: { number: true } });

  const highest = rows.reduce((max, row) => {
    const value = Number(row.number.replace(/\D/g, ""));
    return Number.isFinite(value) && value > max ? value : max;
  }, 1000);

  return `DF-Q-${highest + 1}`;
}

// Price for this customer, captured onto the line at the moment it is added.
async function priceForCustomer(db, productId, tierId) {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { priceListItems: { include: { priceList: true } }, defaultPlan: true },
  });

  if (!product || !product.isActive) return null;

  const usable = product.priceListItems.filter(
    (item) => item.priceList.isActive && (!item.priceList.tierId || item.priceList.tierId === tierId),
  );
  const forTier = usable.filter((item) => item.priceList.tierId === tierId);

  return { product, unitPrice: resolveUnitPrice(product, forTier.length ? forTier : usable) };
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
      number: await nextNumber(req.db),
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
      number: await nextNumber(req.db),
      customerId: source.customerId,
      repId: req.user.id,
      status: QUOTATION_STATUS.DRAFT,
      inquiryDate: new Date(),
      notes: source.notes,
      lines: {
        create: source.lines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
          unitPrice: line.unitPrice,
          discountPct: line.discountPct,
          billingType: line.billingType,
          planId: line.planId,
          startDate: line.startDate,
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

  const resolved = await priceForCustomer(req.db, parsed.data.productId, quotation.customer.tierId);
  if (!resolved) return res.status(404).json({ error: "That product is not available" });

  const { product, unitPrice } = resolved;
  const billingType = parsed.data.billingType || product.defaultBillingType;
  const isRecurring = billingType === BILLING_TYPE.RECURRING;
  const qty = parsed.data.qty ?? 1;

  const candidate = {
    productId: product.id,
    discountPct: parsed.data.discountPct ?? 0,
    billingType,
    planId: isRecurring ? parsed.data.planId || product.defaultPlanId || "MONTHLY" : null,
    startDate: isRecurring
      ? parsed.data.startDate
        ? new Date(parsed.data.startDate)
        : new Date()
      : null,
  };

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
    data: { quotationId: quotation.id, unitPrice, qty, ...candidate },
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
    return res.status(400).json({ error: "Add at least one product before confirming" });
  }

  const plan = await resolveConfirmTarget(req.db, quotation);
  if (plan.error) return res.status(409).json({ error: plan.error });

  const needsApproval = plan.status === QUOTATION_STATUS.PENDING_APPROVAL;

  // A resubmitted quotation is scored again from scratch, so earlier steps are
  // cleared rather than added to.
  await req.db.approvalStep.deleteMany({ where: { quotationId: quotation.id } });

  await req.db.quotation.update({
    where: { id: quotation.id },
    data: {
      status: plan.status,
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
    detail: `${describeChange("Status", quotation.status, plan.status)} · risk ${plan.risk.score} points`,
  });

  if (needsApproval) {
    await notifyStepPending(req, quotation, plan.steps[0], plan.risk.score);
  } else {
    // Inside its ceilings, so it is approved on the spot and the split is
    // worked out straight away.
    await suggestFulfilment(req.db, quotation.id);
  }

  await respondWithDetail(req, res, quotation.id);
});

// Records that the customer agreed away from the portal. The portal route ends
// in the same place.
quotationsRouter.post("/:id/accept", async (req, res) => {
  const quotation = await loadQuotation(req.db, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  const acceptable = [QUOTATION_STATUS.APPROVED, QUOTATION_STATUS.SENT];
  if (!acceptable.includes(quotation.status)) {
    return res.status(409).json({ error: "Only an approved quotation can be marked as accepted" });
  }

  await req.db.quotation.update({
    where: { id: quotation.id },
    data: { status: QUOTATION_STATUS.CONFIRMED, confirmedAt: new Date() },
  });

  await logActivity(req.db, {
    quotationId: quotation.id,
    userId: req.user.id,
    action: "QUOTATION_ACCEPTED",
    detail: `${describeChange("Status", quotation.status, QUOTATION_STATUS.CONFIRMED)} · customer accepted`,
  });

  // Agreeing the order is what takes the stock. A quotation that never gets
  // this far holds none.
  const confirmed = { ...quotation, status: QUOTATION_STATUS.CONFIRMED };
  const fulfilment = await executeFulfilment(req.db, req.dbMode, confirmed, req.user.id);
  if (fulfilment.error) return res.status(409).json({ error: fulfilment.error });

  // Agreeing the order also raises its opening invoice and opens a
  // subscription for each recurring line.
  await billConfirmedOrder(req.db, req.dbMode, confirmed, req.user.id);

  const approvers = await req.db.user.findMany({
    where: { id: { in: quotation.approvalSteps.map((step) => step.actorId).filter(Boolean) } },
    select: { id: true, email: true, name: true },
  });

  await notify(req.db, req.dbMode, {
    users: [quotation.rep, ...approvers].filter((user) => user && user.id !== req.user.id),
    type: NOTIFICATION_TYPES.QUOTATION_ACCEPTED,
    title: `${quotation.number} accepted by ${quotation.customer.name}`,
    body: "The quotation is now a confirmed order.",
    quotationId: quotation.id,
  });

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
