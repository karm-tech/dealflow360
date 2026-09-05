// How far a quotation's discounts sit past the ceilings that apply to it.

import { quotationTotals } from "./pricing.js";

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Two ceilings apply to every line and the stricter one governs: a Gold
// customer still only gets the service ceiling on a service line.
export function lineCeilingPct(tierMaxPct, categoryCeilingPct) {
  return Math.min(tierMaxPct, categoryCeilingPct);
}

// Overages are added up, not averaged. Several lines a little over give away
// margin the same way one line far over does, and an average would hide both.
export function scoreQuotation(quotation) {
  const totals = quotationTotals(quotation.lines);
  const tierMaxPct = quotation.customer.tier.maxDiscountPct;

  const lines = quotation.lines.map((line, index) => {
    const figures = totals.lineFigures[index];
    const ceilingPct = lineCeilingPct(tierMaxPct, line.product.category.discountCeilingPct);
    const overagePoints = round(Math.max(0, figures.discountPct - ceilingPct));

    return {
      lineId: line.id,
      productName: line.product.name,
      category: line.product.category.name,
      discountPct: figures.discountPct,
      ceilingPct,
      overagePoints,
      // What the overage is worth over a year, so scale reads alongside the rule.
      moneyOverCeiling: round((figures.annualGross * overagePoints) / 100),
      isBreach: overagePoints > 0,
    };
  });

  return {
    score: round(lines.reduce((total, line) => total + line.overagePoints, 0)),
    moneyOverCeiling: round(lines.reduce((total, line) => total + line.moneyOverCeiling, 0)),
    tierMaxPct,
    lines,
    breaches: lines.filter((line) => line.isBreach),
  };
}
