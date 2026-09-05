// Billing arithmetic and the shapes it produces. Nothing here touches the
// database: billingService.js decides when these run and what they change.

import { INVOICE_STATUS } from "./constants.js";
import { periodBounds, round, wholeDaysBetween } from "./pricing.js";

export function formatInvoiceNumber(value) {
  return `DF-INV-${String(value).padStart(4, "0")}`;
}

export function formatSubscriptionReference(value) {
  return `DF-SUB-${String(value).padStart(4, "0")}`;
}

export function formatCreditNoteNumber(value) {
  return `DF-CN-${String(value).padStart(4, "0")}`;
}

// A schedule looks twelve months ahead whatever the interval, so a yearly plan
// shows one row rather than twelve years of them.
const HORIZON_MONTHS = 12;

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Every period a subscription will be billed for over the horizon. The first
// may be short because the subscription started partway through it; the rest
// are whole periods at the full amount.
export function scheduleRows({ periodAmount, startDate, months, endDate = null }) {
  const rows = [];
  const count = Math.max(1, Math.ceil(HORIZON_MONTHS / months));

  let { periodStart, periodEnd } = periodBounds(startDate, months);
  let coverFrom = new Date(startDate);

  for (let index = 0; index < count; index += 1) {
    if (endDate && coverFrom > new Date(endDate)) break;

    const periodDays = wholeDaysBetween(periodStart, periodEnd) + 1;
    const daysCovered = wholeDaysBetween(coverFrom, periodEnd) + 1;
    const isProrated = daysCovered < periodDays;

    rows.push({
      periodStart: new Date(coverFrom),
      periodEnd: new Date(periodEnd),
      amount: isProrated ? round((periodAmount / periodDays) * daysCovered) : round(periodAmount),
      isProrated,
    });

    coverFrom = addDays(periodEnd, 1);
    const nextBounds = periodBounds(coverFrom, months);
    periodStart = nextBounds.periodStart;
    periodEnd = nextBounds.periodEnd;
  }

  return rows;
}

// What is left owing once payments and any credit are taken off.
export function outstandingOn({ total, paid, credited }) {
  return round(total - paid - credited);
}

// Status follows the money. Nothing sets it by hand, so it cannot disagree with
// the payments recorded against the invoice.
export function deriveInvoiceStatus({ total, paid, credited }) {
  const outstanding = outstandingOn({ total, paid, credited });

  if (outstanding <= 0.005) return INVOICE_STATUS.PAID;
  if (paid > 0) return INVOICE_STATUS.PARTIALLY_PAID;
  return INVOICE_STATUS.ISSUED;
}

// Overdue is worked out from the due date rather than stored, so it becomes
// true on its own the day it should.
export function isOverdue(invoice, now = new Date()) {
  const owing = [INVOICE_STATUS.ISSUED, INVOICE_STATUS.PARTIALLY_PAID];
  if (!owing.includes(invoice.status) || !invoice.dueDate) return false;
  return new Date(invoice.dueDate) < now;
}

// Days paid for but not used, as a share of the period that was billed. Ending
// a subscription part way through a period credits this back.
export function unusedPortion({ amount, periodStart, periodEnd, endsOn }) {
  const covered = wholeDaysBetween(new Date(periodStart), new Date(periodEnd)) + 1;
  const unused = wholeDaysBetween(new Date(endsOn), new Date(periodEnd));

  if (covered <= 0 || unused <= 0) return { amount: 0, covered, unused: 0 };

  return {
    amount: round((amount / covered) * unused),
    covered,
    unused,
  };
}

// Changing quantity partway through a period charges only the days left at the
// difference. The adjustment is carried onto the next scheduled period rather
// than raised on its own.
export function midPeriodAdjustment({ oldAmount, newAmount, periodStart, periodEnd, changedOn }) {
  const periodDays = wholeDaysBetween(new Date(periodStart), new Date(periodEnd)) + 1;
  const remainingDays = wholeDaysBetween(new Date(changedOn), new Date(periodEnd)) + 1;

  if (periodDays <= 0 || remainingDays <= 0) return { amount: 0, periodDays, remainingDays: 0 };

  const dailyDifference = (newAmount - oldAmount) / periodDays;
  return {
    amount: round(dailyDifference * remainingDays),
    periodDays,
    remainingDays,
  };
}

export function dueDateFrom(issueDate, termsDays) {
  return addDays(issueDate, termsDays);
}
