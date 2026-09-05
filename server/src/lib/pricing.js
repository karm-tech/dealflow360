// Every figure the app shows about money is produced here, on the server. The
// browser renders what these functions return and never recalculates a total.

import { BILLING_TYPE } from "./constants.js";

// A recurring line is priced per period. Dividing by the months in that period
// puts monthly, quarterly and yearly plans on one scale.
const MONTHS_PER_PERIOD = { MONTH: 1, QUARTER: 3, YEAR: 12 };

export function monthsInPeriod(plan) {
  if (!plan) return 1;
  return (MONTHS_PER_PERIOD[plan.interval] || 1) * (plan.intervalCount || 1);
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Price comes from the customer's tier price list, then any list with no tier,
// then the product's own price. Captured onto the line when it is added, so a
// later catalogue change never reprices an existing quotation.
export function resolveUnitPrice(product, priceListItems) {
  const tierPrice = priceListItems.find((item) => item.priceList.tierId);
  if (tierPrice) return tierPrice.price;

  const generalPrice = priceListItems.find((item) => !item.priceList.tierId);
  if (generalPrice) return generalPrice.price;

  return product.salesPrice;
}

// Line and order discounts add up. Governance checks this combined figure, so
// splitting a discount across the two levels cannot slip under a ceiling.
export function effectiveDiscountPct(lineDiscountPct, orderDiscountPct) {
  const combined = (lineDiscountPct || 0) + (orderDiscountPct || 0);
  return Math.min(100, Math.max(0, combined));
}

// The period a recurring line's start date falls inside, anchored to the
// calendar: months to the 1st, quarters to Jan/Apr/Jul/Oct, years to January.
function periodBounds(startDate, months) {
  const start = new Date(startDate);
  const year = start.getFullYear();
  const month = start.getMonth();
  const anchorMonth = Math.floor(month / months) * months;

  const periodStart = new Date(year, anchorMonth, 1);
  const periodEnd = new Date(year, anchorMonth + months, 0);
  return { periodStart, periodEnd };
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function wholeDaysBetween(from, to) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

// A subscription starting mid period is charged a daily rate for the days it
// actually covers. Without a start date it is billed for a full period.
export function prorateFirstPeriod(periodAmount, startDate, months) {
  if (!startDate) return { amount: round(periodAmount), isProrated: false };

  const { periodStart, periodEnd } = periodBounds(startDate, months);
  const periodDays = wholeDaysBetween(periodStart, periodEnd) + 1;
  const daysCovered = wholeDaysBetween(new Date(startDate), periodEnd) + 1;

  if (daysCovered >= periodDays) return { amount: round(periodAmount), isProrated: false };

  const dailyRate = periodAmount / periodDays;
  return {
    amount: round(dailyRate * daysCovered),
    isProrated: true,
    periodDays,
    daysCovered,
  };
}

// Everything a single line contributes. `product` and `plan` come from the
// line's relations.
export function lineFigures(line, orderDiscountPct) {
  const product = line.product;
  const isRecurring = line.billingType === BILLING_TYPE.RECURRING;
  const months = isRecurring ? monthsInPeriod(line.plan) : 1;

  const discountPct = effectiveDiscountPct(line.discountPct, orderDiscountPct);
  const gross = line.qty * line.unitPrice;
  const net = gross * (1 - discountPct / 100);
  const cost = line.qty * product.cost;
  const taxRatePct = product.taxRatePct || 0;

  // Monthly equivalents let one-time and recurring lines be compared and added.
  const monthlyNet = isRecurring ? net / months : 0;
  const monthlyCost = isRecurring ? cost / months : 0;
  const annualNet = isRecurring ? monthlyNet * 12 : net;
  const annualCost = isRecurring ? monthlyCost * 12 : cost;
  // Discount is taken off the gross, so the value given away is measured there.
  const annualGross = isRecurring ? (gross / months) * 12 : gross;

  // What this line puts on the first invoice: a one-time line in full, a
  // recurring line only for the days its first period covers.
  const firstPeriod = isRecurring
    ? prorateFirstPeriod(net, line.startDate, months)
    : { amount: net, isProrated: false };

  return {
    isRecurring,
    months,
    discountPct: round(discountPct),
    gross: round(gross),
    net: round(net),
    taxRatePct,
    taxAmount: round(net * (taxRatePct / 100)),
    total: round(net * (1 + taxRatePct / 100)),
    monthlyNet: round(monthlyNet),
    annualNet: round(annualNet),
    annualCost: round(annualCost),
    annualGross: round(annualGross),
    firstInvoiceNet: round(firstPeriod.amount),
    firstInvoiceTax: round(firstPeriod.amount * (taxRatePct / 100)),
    isProrated: firstPeriod.isProrated,
  };
}

// A mixed order has no single total, so each figure is reported separately.
// Margin runs on the annual contract value: a discount buried on a
// subscription line barely moves a first invoice, but it shows up over a year.
export function quotationTotals(lines, orderDiscountPct) {
  const figures = lines.map((line) => lineFigures(line, orderDiscountPct));

  let oneTimeNet = 0;
  let recurringMonthlyNet = 0;
  let firstInvoiceNet = 0;
  let taxAmount = 0;
  let annualNet = 0;
  let annualCost = 0;

  for (const figure of figures) {
    if (figure.isRecurring) {
      recurringMonthlyNet += figure.monthlyNet;
    } else {
      oneTimeNet += figure.net;
    }
    firstInvoiceNet += figure.firstInvoiceNet;
    taxAmount += figure.firstInvoiceTax;
    annualNet += figure.annualNet;
    annualCost += figure.annualCost;
  }

  const marginPct = annualNet > 0 ? ((annualNet - annualCost) / annualNet) * 100 : 0;

  return {
    oneTimeNet: round(oneTimeNet),
    recurringMonthlyNet: round(recurringMonthlyNet),
    firstInvoiceNet: round(firstInvoiceNet),
    taxAmount: round(taxAmount),
    grandTotal: round(firstInvoiceNet + taxAmount),
    annualContractValue: round(annualNet),
    annualCost: round(annualCost),
    marginPct: round(marginPct),
    lineFigures: figures,
  };
}
