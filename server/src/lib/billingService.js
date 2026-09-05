// Reads and writes billing. The arithmetic lives in billing.js; this file only
// decides when it runs and what it changes.

import {
  BILLING_TYPE,
  INVOICE_STATUS,
  INVOICE_TYPE,
  SCHEDULE_STATUS,
  SUBSCRIPTION_STATUS,
} from "./constants.js";
import { logActivity } from "./activity.js";
import { notify, NOTIFICATION_TYPES } from "./notify.js";
import { lineFigures, monthsInPeriod, round } from "./pricing.js";
import {
  deriveInvoiceStatus,
  dueDateFrom,
  formatCreditNoteNumber,
  formatInvoiceNumber,
  formatSubscriptionReference,
  isOverdue,
  midPeriodAdjustment,
  outstandingOn,
  scheduleRows,
  unusedPortion,
} from "./billing.js";
import { defaultRenewalLeadDays } from "./renewal.js";

// --- numbering --------------------------------------------------------------

// One sequence per document type, taking the highest in use rather than the
// newest row, which need not be the highest.
async function nextInSequence(rows, key) {
  return rows.reduce((max, row) => {
    const value = Number(String(row[key] || "").replace(/\D/g, ""));
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);
}

async function nextInvoiceNumber(db) {
  const rows = await db.invoice.findMany({ select: { number: true } });
  return formatInvoiceNumber((await nextInSequence(rows, "number")) + 1);
}

async function nextSubscriptionReference(db) {
  const rows = await db.subscription.findMany({ select: { reference: true } });
  return formatSubscriptionReference((await nextInSequence(rows, "reference")) + 1);
}

async function nextCreditNoteNumber(db) {
  const rows = await db.creditNote.findMany({ select: { number: true } });
  return formatCreditNoteNumber((await nextInSequence(rows, "number")) + 1);
}

async function paymentTerms(db) {
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  return settings?.paymentTermsDays ?? 30;
}

// --- status -----------------------------------------------------------------

function totalsFor(invoice) {
  const paid = (invoice.payments || []).reduce((sum, row) => sum + row.amount, 0);
  const credited = (invoice.creditNotes || []).reduce((sum, row) => sum + row.amount, 0);
  return { paid: round(paid), credited: round(credited) };
}

// Recalculated from the payments and credit notes on the invoice, never set by
// hand, so the status cannot disagree with the money against it.
export async function refreshInvoiceStatus(db, invoiceId) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true, creditNotes: true },
  });
  if (!invoice) return null;
  if ([INVOICE_STATUS.DRAFT, INVOICE_STATUS.CANCELLED].includes(invoice.status)) return invoice;

  const { paid, credited } = totalsFor(invoice);
  const status = deriveInvoiceStatus({ total: invoice.total, paid, credited });

  if (status !== invoice.status) {
    await db.invoice.update({ where: { id: invoiceId }, data: { status } });
  }

  // A fully settled invoice settles the periods it covered.
  if (status === INVOICE_STATUS.PAID) {
    await db.billingSchedule.updateMany({
      where: { invoiceId },
      data: { status: SCHEDULE_STATUS.PAID },
    });
  }

  return { ...invoice, status };
}

// --- what confirming an order produces --------------------------------------

function periodAmountFor(line) {
  const figures = lineFigures(line);
  return round(figures.net);
}

// One invoice for the one-time lines plus the part of each recurring line that
// its first period covers. Subscriptions carry everything after that.
async function raiseOpeningInvoice(db, quotation) {
  const issueDate = new Date();
  const termsDays = await paymentTerms(db);

  const lines = [];
  let subtotal = 0;
  let taxAmount = 0;

  for (const line of quotation.lines) {
    const figures = lineFigures(line);
    const isRecurring = line.billingType === BILLING_TYPE.RECURRING;
    const net = isRecurring ? figures.firstInvoiceNet : figures.net;

    if (net <= 0) continue;

    const suffix = isRecurring && figures.isProrated ? " — first period" : isRecurring ? " — period 1" : "";

    lines.push({
      description: `${line.product.name}${suffix}`,
      qty: line.qty,
      unitPrice: line.unitPrice,
      discountPct: line.discountPct,
      taxRatePct: figures.taxRatePct,
      lineTotal: net,
      quotationLineId: line.id,
    });

    subtotal += net;
    taxAmount += round(net * (figures.taxRatePct / 100));
  }

  if (lines.length === 0) return null;

  subtotal = round(subtotal);
  taxAmount = round(taxAmount);

  return db.invoice.create({
    data: {
      number: await nextInvoiceNumber(db),
      quotationId: quotation.id,
      customerId: quotation.customerId,
      type: INVOICE_TYPE.ONE_TIME,
      issueDate,
      dueDate: dueDateFrom(issueDate, termsDays),
      subtotal,
      taxAmount,
      total: round(subtotal + taxAmount),
      status: INVOICE_STATUS.ISSUED,
      lines: { create: lines },
    },
  });
}

// A subscription per recurring line, with its periods laid out ahead. The first
// period is already on the opening invoice, so it is marked as invoiced.
async function createSubscriptions(db, quotation, openingInvoiceId) {
  const created = [];

  for (const line of quotation.lines) {
    if (line.billingType !== BILLING_TYPE.RECURRING) continue;

    const months = monthsInPeriod(line.plan);
    const periodAmount = periodAmountFor(line);
    const startDate = line.startDate || new Date();

    const rows = scheduleRows({
      periodAmount,
      startDate,
      months,
      endDate: line.endDate,
    });

    const subscription = await db.subscription.create({
      data: {
        reference: await nextSubscriptionReference(db),
        quotationLineId: line.id,
        customerId: quotation.customerId,
        planId: line.planId,
        qty: line.qty,
        unitPrice: line.unitPrice,
        discountPct: line.discountPct,
        startDate,
        // The first period is billed on the opening invoice, so the next one
        // due is the second.
        nextBillingDate: rows[1] ? rows[1].periodStart : rows[0].periodEnd,
        endDate: line.endDate,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        // Copied so the subscription keeps its notice period once the order
        // that created it is history.
        renewalLeadDays: line.renewalLeadDays ?? defaultRenewalLeadDays(line.plan),
        schedules: {
          create: rows.map((row, index) => ({
            periodStart: row.periodStart,
            periodEnd: row.periodEnd,
            amount: row.amount,
            isProrated: row.isProrated,
            status: index === 0 ? SCHEDULE_STATUS.INVOICED : SCHEDULE_STATUS.SCHEDULED,
            invoiceId: index === 0 ? openingInvoiceId : null,
          })),
        },
      },
    });

    created.push(subscription);
  }

  return created;
}

// A renewal does not open a second subscription: it bills the next period of
// the one it renews, at whatever figures the rep agreed on the renewal rather
// than what was forecast when the subscription opened.
async function billRenewalOrder(db, mode, quotation, userId) {
  const subscription = await db.subscription.findUnique({
    where: { id: quotation.renewsSubscriptionId },
    include: { schedules: { orderBy: { periodStart: "asc" } } },
  });
  if (!subscription || !quotation.renewalPeriodStart) return { skipped: true };

  const period = subscription.schedules.find(
    (row) => row.periodStart.getTime() === quotation.renewalPeriodStart.getTime(),
  );
  if (!period || period.status !== SCHEDULE_STATUS.SCHEDULED) return { skipped: true };

  const issueDate = new Date();
  const termsDays = await paymentTerms(db);
  const covers = `${period.periodStart.toDateString()} to ${period.periodEnd.toDateString()}`;

  const lines = [];
  let subtotal = 0;
  let taxAmount = 0;

  for (const line of quotation.lines) {
    const figures = lineFigures(line);
    if (figures.net <= 0) continue;

    lines.push({
      description: `${line.product.name} — ${covers}`,
      qty: line.qty,
      unitPrice: line.unitPrice,
      discountPct: line.discountPct,
      taxRatePct: figures.taxRatePct,
      lineTotal: figures.net,
      quotationLineId: line.id,
    });

    subtotal += figures.net;
    taxAmount += round(figures.net * (figures.taxRatePct / 100));
  }

  if (lines.length === 0) return { skipped: true };

  subtotal = round(subtotal);
  taxAmount = round(taxAmount);

  const invoice = await db.invoice.create({
    data: {
      number: await nextInvoiceNumber(db),
      quotationId: quotation.id,
      customerId: quotation.customerId,
      type: INVOICE_TYPE.RECURRING,
      issueDate,
      dueDate: dueDateFrom(issueDate, termsDays),
      subtotal,
      taxAmount,
      total: round(subtotal + taxAmount),
      status: INVOICE_STATUS.ISSUED,
      lines: { create: lines },
    },
  });

  await db.billingSchedule.update({
    where: { id: period.id },
    data: { status: SCHEDULE_STATUS.INVOICED, invoiceId: invoice.id, amount: subtotal },
  });

  // The period just billed is behind us, so the subscription now points at the
  // next one still outstanding.
  const next = subscription.schedules.find(
    (row) => row.status === SCHEDULE_STATUS.SCHEDULED && row.id !== period.id,
  );

  await db.subscription.update({
    where: { id: subscription.id },
    data: { nextBillingDate: next ? next.periodStart : period.periodEnd },
  });

  await logActivity(db, {
    quotationId: quotation.id,
    userId,
    action: "RENEWAL_BILLED",
    detail: `${invoice.number} for ${subscription.reference} · ${covers}`,
  });

  const portalUsers = await db.user.findMany({
    where: { customerId: quotation.customerId, status: "ACTIVE" },
    select: { id: true, email: true, name: true },
  });

  await notify(db, mode, {
    users: portalUsers,
    type: NOTIFICATION_TYPES.INVOICE_ISSUED,
    title: `Invoice ${invoice.number} for ${covers}`,
    body: `Due ${new Date(invoice.dueDate).toDateString()}.`,
    quotationId: quotation.id,
  });

  return { invoiceId: invoice.id, subscriptions: 0, renewed: subscription.reference };
}

// The whole billing cascade for a newly agreed order.
export async function billConfirmedOrder(db, mode, quotation, userId) {
  const already = await db.invoice.count({ where: { quotationId: quotation.id } });
  if (already > 0) return { skipped: true };

  if (quotation.renewsSubscriptionId) {
    return billRenewalOrder(db, mode, quotation, userId);
  }

  const invoice = await raiseOpeningInvoice(db, quotation);
  const subscriptions = await createSubscriptions(db, quotation, invoice ? invoice.id : null);

  if (invoice) {
    await logActivity(db, {
      quotationId: quotation.id,
      userId,
      action: "INVOICE_RAISED",
      detail: `${invoice.number} for ${invoice.total.toFixed(2)}`,
    });

    const portalUsers = await db.user.findMany({
      where: { customerId: quotation.customerId, status: "ACTIVE" },
      select: { id: true, email: true, name: true },
    });

    await notify(db, mode, {
      users: portalUsers,
      type: NOTIFICATION_TYPES.INVOICE_ISSUED,
      title: `Invoice ${invoice.number} for ${quotation.number}`,
      body: `Due ${new Date(invoice.dueDate).toDateString()}.`,
      quotationId: quotation.id,
    });
  }

  if (subscriptions.length > 0) {
    await logActivity(db, {
      quotationId: quotation.id,
      userId,
      action: "SUBSCRIPTIONS_STARTED",
      detail: `${subscriptions.length} subscription(s) opened`,
    });
  }

  return { invoiceId: invoice ? invoice.id : null, subscriptions: subscriptions.length };
}

// Periods that have fallen due and have not been billed. Raising invoices from
// these is where scheduled generation would attach; nothing does so yet.
export async function dueSchedules(db, asOf = new Date()) {
  return db.billingSchedule.findMany({
    where: {
      status: SCHEDULE_STATUS.SCHEDULED,
      periodStart: { lte: asOf },
      subscription: { status: SUBSCRIPTION_STATUS.ACTIVE },
    },
    include: { subscription: { include: { customer: true } } },
    orderBy: { periodStart: "asc" },
  });
}

// --- payments and credit notes ----------------------------------------------

export async function recordPayment(db, mode, invoiceId, { method, amount, reference, paidAt }, actor) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      payments: true,
      creditNotes: true,
      quotation: { include: { rep: { select: { id: true, name: true, email: true } } } },
    },
  });

  if (!invoice) return { error: "That invoice no longer exists" };
  if (invoice.status === INVOICE_STATUS.CANCELLED) {
    return { error: "That invoice was cancelled" };
  }

  const { paid, credited } = totalsFor(invoice);
  const outstanding = outstandingOn({ total: invoice.total, paid, credited });

  if (outstanding <= 0) return { error: "That invoice is already settled" };
  if (amount > outstanding + 0.005) {
    return { error: `Only ${outstanding.toFixed(2)} is outstanding on this invoice` };
  }

  await db.payment.create({
    data: {
      invoiceId,
      method,
      amount: round(amount),
      reference: reference || null,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
    },
  });

  const updated = await refreshInvoiceStatus(db, invoiceId);

  await logActivity(db, {
    quotationId: invoice.quotationId,
    userId: actor.id,
    action: "PAYMENT_RECORDED",
    detail: `${amount.toFixed(2)} against ${invoice.number} by ${method.toLowerCase()}`,
  });

  await notify(db, mode, {
    users: [invoice.quotation.rep].filter((user) => user && user.id !== actor.id),
    type: NOTIFICATION_TYPES.PAYMENT_RECORDED,
    title: `Payment received on ${invoice.number}`,
    body: `${amount.toFixed(2)} from ${invoice.quotation.number}.`,
    quotationId: invoice.quotationId,
  });

  return { status: updated.status };
}

async function raiseCreditNote(db, mode, { invoiceId, amount, reason, quotationId }, actor) {
  const note = await db.creditNote.create({
    data: {
      number: await nextCreditNoteNumber(db),
      invoiceId,
      amount: round(amount),
      reason,
    },
  });

  await refreshInvoiceStatus(db, invoiceId);

  await logActivity(db, {
    quotationId,
    userId: actor.id,
    action: "CREDIT_NOTE_RAISED",
    detail: `${note.number} for ${amount.toFixed(2)} — ${reason}`,
  });

  return note;
}

// --- subscription lifecycle -------------------------------------------------

function currentPeriod(schedules, when = new Date()) {
  return schedules.find(
    (row) => new Date(row.periodStart) <= when && new Date(row.periodEnd) >= when,
  );
}

async function loadSubscription(db, id) {
  return db.subscription.findUnique({
    where: { id },
    include: {
      customer: true,
      plan: true,
      schedules: { orderBy: { periodStart: "asc" }, include: { invoice: true } },
      quotationLine: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
          quotation: {
            include: { rep: { select: { id: true, name: true, email: true } } },
          },
        },
      },
    },
  });
}

// Quantity changes take effect from today. The days already covered at the old
// quantity stay paid for; the difference for the rest of the period is carried
// onto the next scheduled row rather than invoiced on its own.
export async function changeSubscriptionQty(db, id, qty, actor) {
  const subscription = await loadSubscription(db, id);
  if (!subscription) return { error: "That subscription no longer exists" };
  if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    return { error: "Only an active subscription can be changed" };
  }
  if (qty === subscription.qty) return { error: "That is already the quantity" };

  const months = monthsInPeriod(subscription.plan);
  const perUnit = subscription.unitPrice * (1 - subscription.discountPct / 100);
  const oldAmount = round(perUnit * subscription.qty);
  const newAmount = round(perUnit * qty);

  const now = new Date();
  const period = currentPeriod(subscription.schedules, now);
  const upcoming = subscription.schedules.filter(
    (row) => row.status === SCHEDULE_STATUS.SCHEDULED && new Date(row.periodStart) > now,
  );

  let adjustment = { amount: 0, remainingDays: 0 };

  if (period) {
    adjustment = midPeriodAdjustment({
      oldAmount: period.amount,
      // Scale the period's own amount, so a prorated first period stays prorated.
      newAmount: round(period.amount * (newAmount / oldAmount)),
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      changedOn: now,
    });
  }

  await db.subscription.update({ where: { id }, data: { qty } });

  // Future periods bill at the new amount.
  for (const row of upcoming) {
    await db.billingSchedule.update({
      where: { id: row.id },
      data: { amount: newAmount },
    });
  }

  // The part-period difference rides on the next period rather than becoming an
  // invoice of its own.
  const next = upcoming[0];
  if (next && adjustment.amount !== 0) {
    await db.billingSchedule.update({
      where: { id: next.id },
      data: { amount: round(newAmount + adjustment.amount) },
    });
  }

  await logActivity(db, {
    quotationId: subscription.quotationLine.quotation.id,
    userId: actor.id,
    action: "SUBSCRIPTION_QTY_CHANGED",
    detail:
      `${subscription.reference}: ${subscription.qty} → ${qty}` +
      (adjustment.amount
        ? ` · ${adjustment.amount.toFixed(2)} for ${adjustment.remainingDays} remaining day(s) carried to the next period`
        : ""),
  });

  return {
    qty,
    adjustment: adjustment.amount,
    remainingDays: adjustment.remainingDays,
    carriedTo: next ? next.id : null,
  };
}

export async function setSubscriptionPaused(db, id, paused, actor) {
  const subscription = await loadSubscription(db, id);
  if (!subscription) return { error: "That subscription no longer exists" };

  const from = subscription.status;
  const to = paused ? SUBSCRIPTION_STATUS.PAUSED : SUBSCRIPTION_STATUS.ACTIVE;

  if (from === SUBSCRIPTION_STATUS.CANCELLED || from === SUBSCRIPTION_STATUS.ENDED) {
    return { error: "That subscription has already finished" };
  }
  if (from === to) return { error: paused ? "Already paused" : "Already active" };

  await db.subscription.update({ where: { id }, data: { status: to } });

  await logActivity(db, {
    quotationId: subscription.quotationLine.quotation.id,
    userId: actor.id,
    action: paused ? "SUBSCRIPTION_PAUSED" : "SUBSCRIPTION_RESUMED",
    detail: subscription.reference,
  });

  return { status: to };
}

// Ending part way through a period credits back the days paid for but not used,
// against the invoice that actually covered them.
export async function cancelSubscription(db, mode, id, reason, actor) {
  const subscription = await loadSubscription(db, id);
  if (!subscription) return { error: "That subscription no longer exists" };
  if ([SUBSCRIPTION_STATUS.CANCELLED, SUBSCRIPTION_STATUS.ENDED].includes(subscription.status)) {
    return { error: "That subscription has already finished" };
  }

  const now = new Date();
  const period = currentPeriod(subscription.schedules, now);
  const quotationId = subscription.quotationLine.quotation.id;

  let creditNote = null;
  let workings = null;

  // Only a period already billed can be credited. A period still scheduled has
  // taken no money, so there is nothing to give back.
  if (period && period.invoiceId) {
    const portion = unusedPortion({
      amount: period.amount,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      endsOn: now,
    });

    workings = portion;

    if (portion.amount > 0) {
      creditNote = await raiseCreditNote(
        db,
        mode,
        {
          invoiceId: period.invoiceId,
          amount: portion.amount,
          reason: `${subscription.reference} ended early — ${portion.unused} of ${portion.covered} days unused`,
          quotationId,
        },
        actor,
      );
    }
  }

  await db.subscription.update({
    where: { id },
    data: {
      status: SUBSCRIPTION_STATUS.CANCELLED,
      cancelledAt: now,
      endDate: now,
    },
  });

  // Nothing after today will be billed.
  await db.billingSchedule.deleteMany({
    where: {
      subscriptionId: id,
      status: SCHEDULE_STATUS.SCHEDULED,
      periodStart: { gt: now },
    },
  });

  await logActivity(db, {
    quotationId,
    userId: actor.id,
    action: "SUBSCRIPTION_CANCELLED",
    detail: `${subscription.reference}${reason ? ` — ${reason}` : ""}`,
  });

  await notify(db, mode, {
    users: [subscription.quotationLine.quotation.rep].filter(
      (user) => user && user.id !== actor.id,
    ),
    type: NOTIFICATION_TYPES.SUBSCRIPTION_CANCELLED,
    title: `${subscription.reference} cancelled`,
    body: creditNote
      ? `${creditNote.number} raised for ${creditNote.amount.toFixed(2)} of unused days.`
      : "No period was billed, so nothing was credited.",
    quotationId,
  });

  return { creditNote, workings };
}

// --- views ------------------------------------------------------------------

function invoiceSummary(invoice) {
  const { paid, credited } = totalsFor(invoice);

  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    isOverdue: isOverdue(invoice),
    type: invoice.type,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    total: invoice.total,
    paid,
    credited,
    outstanding: outstandingOn({ total: invoice.total, paid, credited }),
    customer: invoice.customer
      ? { id: invoice.customer.id, name: invoice.customer.name }
      : null,
    quotation: invoice.quotation
      ? { id: invoice.quotation.id, number: invoice.quotation.number }
      : null,
  };
}

const INVOICE_INCLUDE = {
  customer: { select: { id: true, name: true } },
  quotation: { select: { id: true, number: true, repId: true } },
  payments: true,
  creditNotes: true,
};

// One ordered list for both the table and the pager, so stepping through
// records follows what the user is looking at.
export async function listInvoices(db, query, user) {
  const where = {};
  if (query.quotationId) where.quotationId = Number(query.quotationId);
  if (query.customerId) where.customerId = Number(query.customerId);
  if (query.status) where.status = String(query.status);
  if (user?.role === "SALES_REP") where.quotation = { repId: user.id };

  const invoices = await db.invoice.findMany({
    where,
    include: INVOICE_INCLUDE,
    orderBy: { issueDate: "desc" },
  });

  const rows = invoices.map(invoiceSummary);

  // Overdue is worked out rather than stored, so it is filtered after shaping.
  if (query.overdue === "true") return rows.filter((row) => row.isOverdue);
  return rows;
}

export async function invoiceRecord(db, id) {
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      ...INVOICE_INCLUDE,
      lines: { orderBy: { id: "asc" } },
      schedules: { include: { subscription: true } },
    },
  });
  if (!invoice) return null;

  const summary = invoiceSummary(invoice);

  return {
    ...summary,
    repId: invoice.quotation ? invoice.quotation.repId : null,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      description: line.description,
      qty: line.qty,
      unitPrice: line.unitPrice,
      discountPct: line.discountPct,
      taxRatePct: line.taxRatePct,
      lineTotal: line.lineTotal,
    })),
    payments: invoice.payments
      .map((payment) => ({
        id: payment.id,
        method: payment.method,
        amount: payment.amount,
        reference: payment.reference,
        paidAt: payment.paidAt,
        // Whether this one actually arrived on time, which is what a customer's
        // payment record is built from.
        isLate: invoice.dueDate ? new Date(payment.paidAt) > new Date(invoice.dueDate) : false,
      }))
      .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt)),
    creditNotes: invoice.creditNotes.map((note) => ({
      id: note.id,
      number: note.number,
      amount: note.amount,
      reason: note.reason,
      createdAt: note.createdAt,
    })),
    periods: invoice.schedules.map((row) => ({
      id: row.id,
      subscriptionId: row.subscriptionId,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      amount: row.amount,
      isProrated: row.isProrated,
    })),
  };
}

function subscriptionSummary(subscription) {
  const perPeriod = round(
    subscription.unitPrice * subscription.qty * (1 - subscription.discountPct / 100),
  );

  return {
    id: subscription.id,
    reference: subscription.reference,
    status: subscription.status,
    qty: subscription.qty,
    perPeriod,
    plan: subscription.plan ? subscription.plan.name : null,
    startDate: subscription.startDate,
    nextBillingDate: subscription.nextBillingDate,
    endDate: subscription.endDate,
    customer: subscription.customer
      ? { id: subscription.customer.id, name: subscription.customer.name }
      : null,
    product: subscription.quotationLine ? subscription.quotationLine.product.name : null,
    quotation: subscription.quotationLine
      ? {
          id: subscription.quotationLine.quotation.id,
          number: subscription.quotationLine.quotation.number,
        }
      : null,
  };
}

const SUBSCRIPTION_INCLUDE = {
  customer: { select: { id: true, name: true } },
  plan: true,
  quotationLine: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      quotation: { select: { id: true, number: true, repId: true } },
    },
  },
};

export async function listSubscriptions(db, query, user) {
  const where = {};
  if (query.customerId) where.customerId = Number(query.customerId);
  if (query.status) where.status = String(query.status);
  if (query.quotationId) {
    where.quotationLine = { quotationId: Number(query.quotationId) };
  }
  if (user?.role === "SALES_REP") {
    where.quotationLine = { ...(where.quotationLine || {}), quotation: { repId: user.id } };
  }

  const subscriptions = await db.subscription.findMany({
    where,
    include: SUBSCRIPTION_INCLUDE,
    orderBy: { nextBillingDate: "asc" },
  });

  return subscriptions.map(subscriptionSummary);
}

export async function subscriptionRecord(db, id) {
  const subscription = await db.subscription.findUnique({
    where: { id },
    include: {
      ...SUBSCRIPTION_INCLUDE,
      schedules: {
        orderBy: { periodStart: "asc" },
        include: { invoice: { select: { id: true, number: true, status: true } } },
      },
    },
  });
  if (!subscription) return null;

  return {
    ...subscriptionSummary(subscription),
    repId: subscription.quotationLine ? subscription.quotationLine.quotation.repId : null,
    unitPrice: subscription.unitPrice,
    discountPct: subscription.discountPct,
    cancelledAt: subscription.cancelledAt,
    schedule: subscription.schedules.map((row) => ({
      id: row.id,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      amount: row.amount,
      isProrated: row.isProrated,
      status: row.status,
      invoice: row.invoice ? { id: row.invoice.id, number: row.invoice.number } : null,
    })),
  };
}

// What a salesperson needs to know about billing on their own order: what was
// invoiced, what recurs, and when the next period falls due.
export async function billingSummary(db, quotationId) {
  const [invoices, subscriptions] = await Promise.all([
    db.invoice.findMany({ where: { quotationId }, include: INVOICE_INCLUDE }),
    db.subscription.findMany({
      where: { quotationLine: { quotationId } },
      include: SUBSCRIPTION_INCLUDE,
    }),
  ]);

  const rows = invoices.map(invoiceSummary);
  const active = subscriptions.filter((row) => row.status === SUBSCRIPTION_STATUS.ACTIVE);

  const recurringMonthly = active.reduce((sum, row) => {
    const perPeriod = row.unitPrice * row.qty * (1 - row.discountPct / 100);
    return sum + perPeriod / monthsInPeriod(row.plan);
  }, 0);

  const nextBilling = active
    .map((row) => row.nextBillingDate)
    .filter(Boolean)
    .sort((a, b) => new Date(a) - new Date(b))[0];

  return {
    invoices: rows,
    invoiceCount: rows.length,
    invoicedTotal: round(rows.reduce((sum, row) => sum + row.total, 0)),
    outstanding: round(rows.reduce((sum, row) => sum + row.outstanding, 0)),
    hasOverdue: rows.some((row) => row.isOverdue),
    subscriptions: subscriptions.map(subscriptionSummary),
    subscriptionCount: subscriptions.length,
    recurringMonthly: round(recurringMonthly),
    nextBillingDate: nextBilling || null,
  };
}

// Live counts for the related-record buttons: a cancelled subscription is dead
// history and is counted nowhere.
export async function billingCounts(db, { quotationId, customerId }) {
  const invoiceWhere = quotationId ? { quotationId } : { customerId };
  const subscriptionWhere = quotationId
    ? { quotationLine: { quotationId } }
    : { customerId };

  const [invoices, subscriptions] = await Promise.all([
    db.invoice.count({ where: { ...invoiceWhere, status: { not: INVOICE_STATUS.CANCELLED } } }),
    db.subscription.count({
      where: { ...subscriptionWhere, status: { not: SUBSCRIPTION_STATUS.CANCELLED } },
    }),
  ]);

  return { invoices, subscriptions };
}
