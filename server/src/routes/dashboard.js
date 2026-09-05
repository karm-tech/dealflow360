// Scoped in the query. A rep is answered only about their own deals.

import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  INTERNAL_ROLES,
  INVOICE_STATUS,
  QUOTATION_STATUS,
  ROLES,
  SUBSCRIPTION_STATUS,
} from "../lib/constants.js";
import { DEAL_HEALTH_INCLUDE, LIVE_STATUSES, scoreDeals } from "../lib/dealHealth.js";
import { CUSTOMER_SCORE_INCLUDE, scoreCustomer, tierSuggestion } from "../lib/customerScore.js";
import { logEvent, logWithoutProgress } from "../lib/activity.js";
import { notify, NOTIFICATION_TYPES, usersInRole } from "../lib/notify.js";
import { parseReportQuery, quotationReportWhere } from "../lib/reportFilters.js";
import { buildSalesReport, reportFilterOptions } from "../lib/reports.js";
import { monthsInPeriod, round } from "../lib/pricing.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireRole(...INTERNAL_ROLES));

function monthKey(date) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString("en-IN", {
    month: "short",
    year: "2-digit",
  });
}

// Six months of buckets, built up front so a month with no deals still shows as
// a gap rather than being silently dropped from the chart.
function recentMonths(count = 6) {
  const months = [];
  const cursor = new Date();
  cursor.setDate(1);

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() - index, 1);
    months.push(monthKey(date));
  }

  return months;
}

dashboardRouter.get("/", async (req, res) => {
  const filters = parseReportQuery(req.query, req.user);
  const scope = quotationReportWhere(filters);
  const now = new Date();
  const options = await reportFilterOptions(req.db, req.user);

  // --- deals in play, with a health score each ---

  const liveWhere = filters.approval
    ? scope
    : { ...scope, status: { in: LIVE_STATUSES } };

  const liveDeals = await req.db.quotation.findMany({
    where: liveWhere,
    include: DEAL_HEALTH_INCLUDE,
  });

  // Only the customers on these deals are scored, so the work stays proportional
  // to what is actually on screen.
  const customerIds = [...new Set(liveDeals.map((deal) => deal.customerId))];

  const customers = await req.db.customer.findMany({
    where: { id: { in: customerIds } },
    include: CUSTOMER_SCORE_INCLUDE,
  });

  const customerBands = new Map();
  const customerScores = new Map();

  for (const customer of customers) {
    const score = scoreCustomer(customer);
    customerBands.set(customer.id, score.band);
    customerScores.set(customer.id, score);
  }

  const scored = await scoreDeals(req.db, liveDeals, { customerBands, now });

  const alerts = scored
    .filter((entry) => entry.health.band !== "HEALTHY")
    .sort((a, b) => a.health.score - b.health.score)
    .map((entry) => ({
      id: entry.quotation.id,
      number: entry.quotation.number,
      status: entry.quotation.status,
      customer: entry.quotation.customer.name,
      customerId: entry.quotation.customerId,
      rep: entry.quotation.rep?.name || null,
      repId: entry.quotation.repId,
      lastActivityAt: entry.quotation.lastActivityAt,
      health: entry.health,
      customerScore: customerScores.get(entry.quotation.customerId) || null,
    }));

  const healthCounts = { HEALTHY: 0, AT_RISK: 0, CRITICAL: 0 };
  for (const entry of scored) healthCounts[entry.health.band] += 1;

  // --- pipeline by stage ---

  const byStatus = await req.db.quotation.groupBy({
    by: ["status"],
    where: scope,
    _count: { _all: true },
  });

  const pipeline = Object.values(QUOTATION_STATUS).map((status) => ({
    status,
    count: byStatus.find((row) => row.status === status)?._count._all || 0,
  }));

  // --- won and lost over six months ---

  const months = recentMonths();
  const since = new Date(months[0] + "-01T00:00:00.000Z");

  const decided = await req.db.quotation.findMany({
    where: {
      ...scope,
      status: {
        in: [QUOTATION_STATUS.CONFIRMED, QUOTATION_STATUS.REJECTED, QUOTATION_STATUS.CANCELLED],
      },
      updatedAt: { gte: since },
    },
    select: { status: true, updatedAt: true, confirmedAt: true },
  });

  const trend = months.map((key) => ({ month: key, label: monthLabel(key), won: 0, lost: 0 }));

  for (const quotation of decided) {
    const key = monthKey(quotation.confirmedAt || quotation.updatedAt);
    const bucket = trend.find((entry) => entry.month === key);
    if (!bucket) continue;

    if (quotation.status === QUOTATION_STATUS.CONFIRMED) bucket.won += 1;
    else bucket.lost += 1;
  }

  const wonCount = trend.reduce((sum, entry) => sum + entry.won, 0);
  const lostCount = trend.reduce((sum, entry) => sum + entry.lost, 0);

  // --- approvals waiting ---

  const approvalWhere = {
    status: "PENDING",
    quotation: scope,
  };

  const pendingSteps = await req.db.approvalStep.findMany({
    where: approvalWhere,
    include: { quotation: { select: { id: true, number: true, approvalPendingSince: true } } },
  });

  const oldestWait = pendingSteps
    .map((step) => step.quotation.approvalPendingSince)
    .filter(Boolean)
    .sort((a, b) => new Date(a) - new Date(b))[0];

  // --- money, and only for the roles whose job it is ---

  const seesMoney = [ROLES.ADMIN, ROLES.FINANCE, ROLES.SALES_MANAGER].includes(req.user.role);
  let money = null;

  if (seesMoney) {
    const invoices = await req.db.invoice.findMany({
      where: { status: { not: INVOICE_STATUS.CANCELLED }, quotation: scope },
      select: {
        total: true,
        status: true,
        dueDate: true,
        payments: { select: { amount: true } },
        creditNotes: { select: { amount: true } },
      },
    });

    let billed = 0;
    let collected = 0;
    let outstanding = 0;
    let overdue = 0;

    for (const invoice of invoices) {
      const credited = invoice.creditNotes.reduce((sum, note) => sum + note.amount, 0);
      const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
      const owed = Math.max(0, invoice.total - credited - paid);

      billed += invoice.total - credited;
      collected += paid;
      outstanding += owed;

      // Overdue is money we are owed past its date, which is a different
      // question from how much is unpaid.
      if (owed > 0 && invoice.dueDate && new Date(invoice.dueDate) < now) overdue += owed;
    }

    const activeSubscriptions = await req.db.subscription.findMany({
      where: { status: SUBSCRIPTION_STATUS.ACTIVE, quotationLine: { quotation: scope } },
      select: { qty: true, unitPrice: true, discountPct: true, plan: { select: { interval: true, intervalCount: true } } },
    });

    const recurringMonthly = activeSubscriptions.reduce((sum, subscription) => {
      const net = subscription.qty * subscription.unitPrice * (1 - subscription.discountPct / 100);
      return sum + net / monthsInPeriod(subscription.plan);
    }, 0);

    money = {
      billed: round(billed),
      collected: round(collected),
      outstanding: round(outstanding),
      overdue: round(overdue),
      recurringMonthly: round(recurringMonthly),
      activeSubscriptions: activeSubscriptions.length,
    };
  }

  res.json({
    scope: req.user.role === ROLES.SALES_REP ? "own" : "all",
    health: { counts: healthCounts, liveCount: scored.length },
    alerts: alerts.slice(0, 12),
    alertCount: alerts.length,
    pipeline,
    trend,
    won: wonCount,
    lost: lostCount,
    winRatePct: wonCount + lostCount > 0 ? round((wonCount / (wonCount + lostCount)) * 100) : null,
    approvals: { pending: pendingSteps.length, oldestWaitingSince: oldestWait || null },
    money,
    options,
  });
});

dashboardRouter.get("/reports", async (req, res) => {
  const [report, options] = await Promise.all([
    buildSalesReport(req.db, req.query, req.user),
    reportFilterOptions(req.db, req.user),
  ]);
  res.json({ ...report, options });
});

// One deal's score, with the reason for every point lost. Used by the drill-down
// on the quotation itself.
dashboardRouter.get("/deals/:id/health", async (req, res) => {
  const id = Number(req.params.id);

  const quotation = await req.db.quotation.findUnique({
    where: { id },
    include: DEAL_HEALTH_INCLUDE,
  });

  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  if (req.user.role === ROLES.SALES_REP && quotation.repId !== req.user.id) {
    return res.status(403).json({ error: "That quotation belongs to another rep" });
  }

  const customer = await req.db.customer.findUnique({
    where: { id: quotation.customerId },
    include: CUSTOMER_SCORE_INCLUDE,
  });

  const customerScore = scoreCustomer(customer);
  const [scored] = await scoreDeals(req.db, [quotation], {
    customerBands: new Map([[quotation.customerId, customerScore.band]]),
  });

  res.json({ health: scored.health, customerScore });
});

// --- acting on an alert -----------------------------------------------------

const nudgeSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

// Message only. A nudge must not move lastActivityAt or the stall clock would reset.
dashboardRouter.post("/deals/:id/nudge", async (req, res) => {
  const parsed = nudgeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const quotation = await req.db.quotation.findUnique({
    where: { id: Number(req.params.id) },
    include: { rep: { select: { id: true, name: true, email: true } } },
  });

  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });
  if (!quotation.rep) return res.status(409).json({ error: "Nobody owns that deal yet" });
  if (quotation.rep.id === req.user.id) {
    return res.status(409).json({ error: "That is your own deal — no need to nudge yourself" });
  }

  const note = parsed.data.note?.trim();

  await notify(req.db, req.dbMode, {
    users: [quotation.rep],
    type: NOTIFICATION_TYPES.DEAL_NUDGED,
    title: `${req.user.name || "A colleague"} nudged ${quotation.number}`,
    body: note || `${quotation.number} has gone quiet and needs a next step.`,
    quotationId: quotation.id,
  });

  await logWithoutProgress(req.db, {
    quotationId: quotation.id,
    userId: req.user.id,
    action: "DEAL_NUDGED",
    detail: note ? `Nudged ${quotation.rep.name}: ${note}` : `Nudged ${quotation.rep.name}`,
  });

  res.json({ ok: true, nudged: quotation.rep.name });
});

// Alerts a manager. Does not inject an approval step — routing stays discount-driven.
dashboardRouter.post("/deals/:id/escalate", async (req, res) => {
  const parsed = nudgeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const quotation = await req.db.quotation.findUnique({
    where: { id: Number(req.params.id) },
    include: { rep: { select: { id: true, name: true } }, customer: { select: { name: true } } },
  });

  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  const managers = await usersInRole(req.db, ROLES.SALES_MANAGER, req.user.id);
  if (managers.length === 0) {
    return res.status(409).json({ error: "There is no sales manager to escalate to" });
  }

  const note = parsed.data.note?.trim();

  await notify(req.db, req.dbMode, {
    users: managers,
    type: NOTIFICATION_TYPES.DEAL_ESCALATED,
    title: `${quotation.number} escalated`,
    body:
      note ||
      `${quotation.customer.name}'s deal ${quotation.number} needs attention${
        quotation.rep ? `, owned by ${quotation.rep.name}` : " and has no owner"
      }.`,
    quotationId: quotation.id,
  });

  await logWithoutProgress(req.db, {
    quotationId: quotation.id,
    userId: req.user.id,
    action: "DEAL_ESCALATED",
    detail: note ? `Escalated to the sales manager: ${note}` : "Escalated to the sales manager",
  });

  res.json({ ok: true, escalatedTo: managers.length });
});

// --- tier suggestions -------------------------------------------------------

// Evidence only. A ceiling does not change until someone applies it.
dashboardRouter.get(
  "/tier-suggestions",
  requireRole(ROLES.ADMIN, ROLES.SALES_MANAGER),
  async (req, res) => {
    const [customers, tiers] = await Promise.all([
      req.db.customer.findMany({
        where: { isActive: true },
        include: { ...CUSTOMER_SCORE_INCLUDE, tier: { select: { id: true, name: true } } },
      }),
      req.db.tier.findMany(),
    ]);

    const suggestions = [];

    for (const customer of customers) {
      const score = scoreCustomer(customer);
      const suggestion = tierSuggestion(customer, score, tiers);
      if (!suggestion) continue;

      suggestions.push({
        customerId: customer.id,
        customerName: customer.name,
        currentTierId: customer.tierId,
        currentTierName: customer.tier.name,
        score: score.score,
        band: score.band,
        label: score.label,
        summary: score.summary,
        ...suggestion,
      });
    }

    res.json({ suggestions });
  },
);

dashboardRouter.post(
  "/tier-suggestions/:customerId/apply",
  requireRole(ROLES.ADMIN, ROLES.SALES_MANAGER),
  async (req, res) => {
    const parsed = z
      .object({ tierId: z.string().min(1, "Choose a tier") })
      .safeParse(req.body);

    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const customerId = Number(req.params.customerId);
    const customer = await req.db.customer.findUnique({
      where: { id: customerId },
      include: { tier: { select: { name: true } } },
    });

    if (!customer) return res.status(404).json({ error: "That customer no longer exists" });

    const tier = await req.db.tier.findUnique({ where: { id: parsed.data.tierId } });
    if (!tier) return res.status(400).json({ error: "That tier no longer exists" });

    await req.db.customer.update({ where: { id: customerId }, data: { tierId: tier.id } });

    await logEvent(req.db, {
      userId: req.user.id,
      action: "CUSTOMER_TIER_CHANGED",
      detail: `${customer.name} moved from ${customer.tier.name} to ${tier.name} (ceiling now ${tier.maxDiscountPct}%)`,
    });

    res.json({ ok: true });
  },
);
