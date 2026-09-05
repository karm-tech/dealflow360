import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { BILLING_ROLES, INTERNAL_ROLES, PAYMENT_METHODS, ROLES } from "../lib/constants.js";
import {
  billingSummary,
  cancelSubscription,
  changeSubscriptionQty,
  invoiceRecord,
  listInvoices,
  listSubscriptions,
  recordPayment,
  setSubscriptionPaused,
  subscriptionRecord,
} from "../lib/billingService.js";
import { dueRenewals, runRenewals } from "../lib/renewalService.js";

export const billingRouter = Router();

billingRouter.use(requireAuth, requireRole(...INTERNAL_ROLES));

const paymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: z.number().positive("Enter an amount"),
  reference: z.string().max(120).optional().nullable(),
  paidAt: z.string().optional().nullable(),
});

const qtySchema = z.object({
  qty: z.number().int().min(1, "Quantity must be at least 1"),
});

const pauseSchema = z.object({ paused: z.boolean() });

const cancelSchema = z.object({ reason: z.string().max(500).optional().nullable() });

// A rep may look at billing for their own deals; changing any of it is finance
// work. Checked here rather than by hiding buttons.
function ownsOrRefuse(res, user, repId) {
  if (user.role === ROLES.SALES_REP && repId !== user.id) {
    res.status(403).json({ error: "That record belongs to another rep's order" });
    return false;
  }
  return true;
}

// --- renewals ---------------------------------------------------------------

// What the run would raise right now, so the sweep can be looked at before it
// is set going.
billingRouter.get("/renewals/due", async (req, res) => {
  const due = await dueRenewals(req.db);

  res.json({
    renewals: due.map(({ subscription, period, leadDays }) => ({
      subscriptionId: subscription.id,
      reference: subscription.reference,
      customer: subscription.customer.name,
      product: subscription.quotationLine.product.name,
      rep: subscription.quotationLine.quotation.rep?.name || null,
      plan: subscription.plan.name,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      amount: period.amount,
      leadDays,
    })),
  });
});

billingRouter.post("/renewals/run", requireRole(...BILLING_ROLES), async (req, res) => {
  const result = await runRenewals(req.db, req.dbMode);
  res.json(result);
});

// --- invoices ---------------------------------------------------------------

billingRouter.get("/invoices", async (req, res) => {
  res.json({ invoices: await listInvoices(req.db, req.query, req.user) });
});

billingRouter.get("/invoices/:id/neighbours", async (req, res) => {
  const rows = await listInvoices(req.db, req.query, req.user);
  const index = rows.findIndex((row) => row.id === Number(req.params.id));

  if (index === -1) {
    return res.json({ prevId: null, nextId: null, position: null, total: rows.length });
  }

  res.json({
    prevId: index > 0 ? rows[index - 1].id : null,
    nextId: index < rows.length - 1 ? rows[index + 1].id : null,
    position: index + 1,
    total: rows.length,
  });
});

billingRouter.get("/invoices/:id", async (req, res) => {
  const invoice = await invoiceRecord(req.db, Number(req.params.id));
  if (!invoice) return res.status(404).json({ error: "That invoice no longer exists" });
  if (!ownsOrRefuse(res, req.user, invoice.repId)) return;

  res.json({ invoice });
});

billingRouter.post("/invoices/:id/payments", requireRole(...BILLING_ROLES), async (req, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const result = await recordPayment(
    req.db,
    req.dbMode,
    Number(req.params.id),
    parsed.data,
    req.user,
  );
  if (result.error) return res.status(409).json({ error: result.error });

  res.json({
    invoice: await invoiceRecord(req.db, Number(req.params.id)),
    message: `Payment of ${parsed.data.amount.toFixed(2)} recorded`,
  });
});

// --- subscriptions ----------------------------------------------------------

billingRouter.get("/subscriptions", async (req, res) => {
  res.json({ subscriptions: await listSubscriptions(req.db, req.query, req.user) });
});

billingRouter.get("/subscriptions/:id/neighbours", async (req, res) => {
  const rows = await listSubscriptions(req.db, req.query, req.user);
  const index = rows.findIndex((row) => row.id === Number(req.params.id));

  if (index === -1) {
    return res.json({ prevId: null, nextId: null, position: null, total: rows.length });
  }

  res.json({
    prevId: index > 0 ? rows[index - 1].id : null,
    nextId: index < rows.length - 1 ? rows[index + 1].id : null,
    position: index + 1,
    total: rows.length,
  });
});

billingRouter.get("/subscriptions/:id", async (req, res) => {
  const subscription = await subscriptionRecord(req.db, Number(req.params.id));
  if (!subscription) return res.status(404).json({ error: "That subscription no longer exists" });
  if (!ownsOrRefuse(res, req.user, subscription.repId)) return;

  res.json({ subscription });
});

billingRouter.post("/subscriptions/:id/qty", requireRole(...BILLING_ROLES), async (req, res) => {
  const parsed = qtySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const result = await changeSubscriptionQty(req.db, Number(req.params.id), parsed.data.qty, req.user);
  if (result.error) return res.status(409).json({ error: result.error });

  const carried = result.adjustment
    ? ` · ${result.adjustment.toFixed(2)} for ${result.remainingDays} remaining day(s) carried to the next period`
    : "";

  res.json({
    subscription: await subscriptionRecord(req.db, Number(req.params.id)),
    message: `Quantity set to ${result.qty}${carried}`,
  });
});

billingRouter.post("/subscriptions/:id/pause", requireRole(...BILLING_ROLES), async (req, res) => {
  const parsed = pauseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const result = await setSubscriptionPaused(req.db, Number(req.params.id), parsed.data.paused, req.user);
  if (result.error) return res.status(409).json({ error: result.error });

  res.json({
    subscription: await subscriptionRecord(req.db, Number(req.params.id)),
    message: parsed.data.paused ? "Subscription paused" : "Subscription resumed",
  });
});

billingRouter.post("/subscriptions/:id/cancel", requireRole(...BILLING_ROLES), async (req, res) => {
  const parsed = cancelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const result = await cancelSubscription(
    req.db,
    req.dbMode,
    Number(req.params.id),
    parsed.data.reason,
    req.user,
  );
  if (result.error) return res.status(409).json({ error: result.error });

  res.json({
    subscription: await subscriptionRecord(req.db, Number(req.params.id)),
    creditNote: result.creditNote
      ? { number: result.creditNote.number, amount: result.creditNote.amount }
      : null,
    message: result.creditNote
      ? `Cancelled · ${result.creditNote.number} raised for ${result.creditNote.amount.toFixed(2)}`
      : "Cancelled · no billed period to credit",
  });
});

// --- the summary shown on a quotation ---------------------------------------

billingRouter.get("/quotation/:id", async (req, res) => {
  const quotation = await req.db.quotation.findUnique({
    where: { id: Number(req.params.id) },
    select: { id: true, repId: true },
  });
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });
  if (!ownsOrRefuse(res, req.user, quotation.repId)) return;

  res.json({ billing: await billingSummary(req.db, quotation.id) });
});
