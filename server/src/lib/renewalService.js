// Raises the renewal quotation for a subscription before its next period
// starts, and tells the rep who owns it.
//
// A renewal is a draft like any other: the rep reviews it, sends it, and the
// customer agrees. Nothing here bills or ships on its own.

import { QUOTATION_STATUS, SCHEDULE_STATUS, SUBSCRIPTION_STATUS } from "./constants.js";
import { logActivity } from "./activity.js";
import { notify, NOTIFICATION_TYPES } from "./notify.js";
import { nextQuotationNumber } from "./quotationNumber.js";
import { defaultRenewalLeadDays, isRenewalDue } from "./renewal.js";
import { renewalEmail } from "./renewalEmail.js";

const SUBSCRIPTION_INCLUDE = {
  customer: true,
  plan: true,
  schedules: { orderBy: { periodStart: "asc" } },
  quotationLine: {
    include: {
      product: true,
      quotation: { include: { rep: { select: { id: true, name: true, email: true } } } },
    },
  },
  renewals: { select: { renewalPeriodStart: true } },
};

// The next period that has not been billed yet. Everything already invoiced is
// behind us, so the first scheduled row is what a renewal would cover.
function nextUnbilledPeriod(subscription) {
  return subscription.schedules.find((row) => row.status === SCHEDULE_STATUS.SCHEDULED) || null;
}

function alreadyRaised(subscription, periodStart) {
  return subscription.renewals.some(
    (row) => row.renewalPeriodStart && row.renewalPeriodStart.getTime() === periodStart.getTime(),
  );
}

// Every active subscription whose notice window has opened and which has no
// renewal quotation for that period yet.
export async function dueRenewals(db, asOf = new Date()) {
  const subscriptions = await db.subscription.findMany({
    where: { status: SUBSCRIPTION_STATUS.ACTIVE },
    include: SUBSCRIPTION_INCLUDE,
  });

  const due = [];

  for (const subscription of subscriptions) {
    const period = nextUnbilledPeriod(subscription);
    if (!period) continue;

    const leadDays = subscription.renewalLeadDays ?? defaultRenewalLeadDays(subscription.plan);
    if (!isRenewalDue(period.periodStart, leadDays, asOf)) continue;
    if (alreadyRaised(subscription, period.periodStart)) continue;

    due.push({ subscription, period, leadDays });
  }

  return due;
}

// One draft carrying only the recurring line. The one-time products from the
// original order were delivered once and are not sold again by a renewal.
async function createRenewalQuotation(db, subscription, period) {
  const line = subscription.quotationLine;
  const source = line.quotation;

  return db.quotation.create({
    data: {
      number: await nextQuotationNumber(db),
      customerId: subscription.customerId,
      // Stays with the rep who owns the original, so it lands in their list.
      repId: source.repId,
      status: QUOTATION_STATUS.DRAFT,
      renewsSubscriptionId: subscription.id,
      renewalPeriodStart: period.periodStart,
      requestedDeliveryDate: period.periodStart,
      notes: `Renewal of ${subscription.reference} for the period from ${period.periodStart.toDateString()}.`,
      lines: {
        create: [
          {
            productId: line.productId,
            qty: subscription.qty,
            unitPrice: subscription.unitPrice,
            discountPct: subscription.discountPct,
            billingType: line.billingType,
            planId: subscription.planId,
            startDate: period.periodStart,
            renewalLeadDays: subscription.renewalLeadDays,
          },
        ],
      },
    },
    include: { customer: true },
  });
}

async function announce(db, mode, { subscription, period, quotation }) {
  const rep = subscription.quotationLine.quotation.rep;
  if (!rep) return;

  const productName = subscription.quotationLine.product.name;

  await notify(db, mode, {
    users: [rep],
    type: NOTIFICATION_TYPES.RENEWAL_DUE,
    title: `${quotation.number} is ready to renew ${subscription.reference}`,
    body: renewalEmail({
      repName: rep.name,
      customerName: subscription.customer.name,
      productName,
      quotationNumber: quotation.number,
      subscriptionReference: subscription.reference,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      amount: period.amount,
      planName: subscription.plan.name,
    }),
    quotationId: quotation.id,
  });

  await logActivity(db, {
    quotationId: quotation.id,
    userId: rep.id,
    action: "RENEWAL_RAISED",
    detail: `Renews ${subscription.reference} · ${productName} · period from ${period.periodStart.toDateString()}`,
  });
}

// Called by the renewal route and on a timer. Safe to run twice: a period that
// already has a renewal is skipped, and the database enforces that too.
export async function runRenewals(db, mode, asOf = new Date()) {
  const due = await dueRenewals(db, asOf);
  const raised = [];

  for (const entry of due) {
    try {
      const quotation = await createRenewalQuotation(db, entry.subscription, entry.period);
      await announce(db, mode, { ...entry, quotation });

      raised.push({
        quotationId: quotation.id,
        number: quotation.number,
        subscriptionReference: entry.subscription.reference,
        customer: entry.subscription.customer.name,
        periodStart: entry.period.periodStart,
      });
    } catch (error) {
      // A unique-constraint clash means another run got there first, which is
      // not a failure. Anything else is.
      if (error.code !== "P2002") throw error;
    }
  }

  return { considered: due.length, raised };
}
