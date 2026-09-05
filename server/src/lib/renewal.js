// Renewal notice periods. Nothing here touches the database: renewalService.js
// decides when these run and what they change.

import { monthsInPeriod } from "./pricing.js";

// Calendar periods vary in length, so the notice window is measured against the
// average month rather than the one the subscription happens to be in. That
// keeps the limit the same every month instead of moving with February.
const DAYS_PER_MONTH = 365.25 / 12;

export function nominalPeriodDays(plan) {
  return Math.round(monthsInPeriod(plan) * DAYS_PER_MONTH);
}

// Notice has to be shorter than the period, otherwise the next renewal would be
// raised before the current one is settled and two would be open at once.
export function maxRenewalLeadDays(plan) {
  return Math.max(1, nominalPeriodDays(plan) - 1);
}

// A week on a monthly plan, longer on plans that need more thought.
const DEFAULT_LEAD_DAYS = { 1: 7, 3: 14, 12: 30 };

export function defaultRenewalLeadDays(plan) {
  const months = monthsInPeriod(plan);
  return Math.min(DEFAULT_LEAD_DAYS[months] || 7, maxRenewalLeadDays(plan));
}

// Returns an error message rather than throwing, so the route can answer with
// it directly.
export function checkRenewalLeadDays(value, plan) {
  if (!Number.isInteger(value) || value < 1) {
    return "Renewal notice must be at least 1 day";
  }

  const max = maxRenewalLeadDays(plan);
  if (value > max) {
    return `Renewal notice must be under one period — at most ${max} days for a ${plan.name.toLowerCase()} plan`;
  }

  return null;
}

export function renewalDueDate(periodStart, leadDays) {
  const due = new Date(periodStart);
  due.setDate(due.getDate() - leadDays);
  due.setHours(0, 0, 0, 0);
  return due;
}

// True once the notice window has opened for a period.
export function isRenewalDue(periodStart, leadDays, asOf = new Date()) {
  return asOf >= renewalDueDate(periodStart, leadDays);
}
