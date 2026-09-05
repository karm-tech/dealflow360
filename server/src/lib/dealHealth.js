// Deal health is derived on read. A stored score would go stale the moment an
// activity row is written. Each penalty carries the sentence that explains it.

import { QUOTATION_STATUS } from "./constants.js";
import { readHealthWeights } from "./dealHealthSettings.js";
import { BAND_DEAL_PENALTY } from "./customerScore.js";
import { lineDiscountPct } from "./pricing.js";

const START = 100;

// Only a deal still in play can be unhealthy. A confirmed order has already
// gone right and a cancelled one has already gone wrong; scoring either would
// fill the dashboard with deals nobody can act on.
export const LIVE_STATUSES = [
  QUOTATION_STATUS.DRAFT,
  QUOTATION_STATUS.PENDING_APPROVAL,
  QUOTATION_STATUS.APPROVED,
  QUOTATION_STATUS.SENT,
  QUOTATION_STATUS.UNDER_NEGOTIATION,
];

const BANDS = [
  { min: 75, band: "HEALTHY", label: "Healthy" },
  { min: 50, band: "AT_RISK", label: "At risk" },
  { min: 0, band: "CRITICAL", label: "Critical" },
];

function round(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function wholeDaysSince(date, now) {
  if (!date) return 0;
  return Math.max(0, Math.floor((now - new Date(date)) / 86400000));
}

function bandFor(score) {
  return BANDS.find((entry) => score >= entry.min) || BANDS[BANDS.length - 1];
}

// One discount figure for a set of lines, weighted by what each line is worth.
// An unweighted average would let 40% off a phone case drown out 12% off the
// hardware it shipped with.
export function weightedDiscountPct(lines) {
  let gross = 0;
  let discounted = 0;

  for (const line of lines) {
    const lineGross = line.qty * line.unitPrice;
    gross += lineGross;
    discounted += lineGross * (lineDiscountPct(line) / 100);
  }

  return gross > 0 ? round((discounted / gross) * 100) : 0;
}

// The average discount this rep gives on their own deals, so a deal is judged
// against its author rather than a fixed number. A rep selling thin-margin
// services would otherwise look reckless next to one selling hardware.
export async function repDiscountAverages(db, settings) {
  const quotations = await db.quotation.findMany({
    where: {
      status: {
        in: [QUOTATION_STATUS.CONFIRMED, QUOTATION_STATUS.SENT, QUOTATION_STATUS.APPROVED],
      },
    },
    select: {
      repId: true,
      lines: { select: { qty: true, unitPrice: true, discountPct: true } },
    },
  });

  const byRep = new Map();

  for (const quotation of quotations) {
    // An unowned deal has no rep to be an average of. Filtered here rather than
    // in the query because the client rejects a null comparison on this column.
    if (!quotation.repId || quotation.lines.length === 0) continue;
    if (!byRep.has(quotation.repId)) byRep.set(quotation.repId, []);
    byRep.get(quotation.repId).push(weightedDiscountPct(quotation.lines));
  }

  const averages = new Map();

  for (const [repId, discounts] of byRep) {
    // Too small a sample is no baseline at all, so the rep is left without one
    // and their deals simply skip this penalty rather than being measured
    // against one or two deals.
    if (discounts.length < settings.minQuotesForRepAverage) continue;

    averages.set(repId, {
      average: round(discounts.reduce((sum, value) => sum + value, 0) / discounts.length),
      sampleSize: discounts.length,
    });
  }

  return averages;
}

// What one quotation needs for a score, beyond the settings and the averages.
export const DEAL_HEALTH_INCLUDE = {
  customer: { select: { id: true, name: true, tierId: true } },
  rep: { select: { id: true, name: true } },
  lines: { select: { qty: true, unitPrice: true, discountPct: true, billingType: true, planId: true } },
};

export function scoreDealHealth(
  quotation,
  { settings, weights, repAverages = new Map(), customerBand = null, now = new Date() } = {},
) {
  const penalties = [];

  // Idle days after the grace period, so a normal working gap is not a penalty.
  const idleDays = wholeDaysSince(quotation.lastActivityAt, now);
  const stalledDays = Math.max(0, idleDays - settings.stalledAfterDays);
  if (stalledDays > 0) {
    const points = Math.min(weights.stalledCap, round(stalledDays * weights.stalledPerDay));
    penalties.push({
      kind: "STALLED",
      points,
      reason: `lost ${points} for ${idleDays} days with no activity`,
      detail: `Nothing has happened on this deal since ${new Date(quotation.lastActivityAt).toDateString()}.`,
    });
  }

  // Discount vs this rep's own average, not a company-wide number.
  const baseline = quotation.repId ? repAverages.get(quotation.repId) : undefined;
  const dealDiscount = weightedDiscountPct(quotation.lines || []);

  if (baseline && dealDiscount - baseline.average > settings.discountAnomalyThresholdPct) {
    const points = weights.discountAnomaly;
    penalties.push({
      kind: "DISCOUNT_ANOMALY",
      points,
      reason: `lost ${points} for a ${round(dealDiscount - baseline.average)} point discount jump`,
      detail: `Discounted ${dealDiscount}% where ${quotation.rep?.name || "this rep"} averages ${baseline.average}% across ${baseline.sampleSize} deals.`,
    });
  }

  // Slip vs the customer's requested date. No date means nothing to be late against.
  if (quotation.requestedDeliveryDate && quotation.estimatedDeliveryDate) {
    const slipDays = Math.max(
      0,
      Math.floor(
        (new Date(quotation.estimatedDeliveryDate) - new Date(quotation.requestedDeliveryDate)) /
          86400000,
      ),
    );

    if (slipDays > 0) {
      const points = Math.min(weights.slippageCap, round(slipDays * weights.slippagePerDay));
      penalties.push({
        kind: "DELIVERY_SLIP",
        points,
        reason: `lost ${points} for a ${slipDays} day delivery slip`,
        detail: `The customer asked for ${new Date(quotation.requestedDeliveryDate).toDateString()}; the split lands on ${new Date(quotation.estimatedDeliveryDate).toDateString()}.`,
      });
    }
  }

  // Internal wait — the delay this team can always clear.
  if (quotation.status === QUOTATION_STATUS.PENDING_APPROVAL && quotation.approvalPendingSince) {
    const waitingDays = wholeDaysSince(quotation.approvalPendingSince, now);
    if (waitingDays > 0) {
      const points = Math.min(
        weights.approvalWaitCap,
        round(waitingDays * weights.approvalWaitPerDay),
      );
      penalties.push({
        kind: "APPROVAL_WAIT",
        points,
        reason: `lost ${points} for ${waitingDays} days waiting on approval`,
        detail: `Sitting in the approval queue since ${new Date(quotation.approvalPendingSince).toDateString()}.`,
      });
    }
  }

  // Customer's payment and close history, as a single lookup.
  if (customerBand && BAND_DEAL_PENALTY[customerBand]) {
    const points = BAND_DEAL_PENALTY[customerBand];
    penalties.push({
      kind: "CUSTOMER_BAND",
      points,
      reason: `lost ${points} because the customer is rated ${customerBand.toLowerCase()}`,
      detail: "Based on how they have paid and how many deals they have seen through.",
    });
  }

  const lost = penalties.reduce((total, penalty) => total + penalty.points, 0);
  const score = Math.max(0, round(START - lost));
  const band = bandFor(score);

  return {
    score,
    band: band.band,
    label: band.label,
    penalties,
    summary:
      penalties.length === 0
        ? "Nothing wrong with this deal"
        : `${score} = ${penalties.map((penalty) => penalty.reason).join(", ")}`,
  };
}

// Scores a set of quotations in one pass, sharing the settings and the rep
// averages rather than recomputing them per deal.
export async function scoreDeals(db, quotations, { customerBands = new Map(), now = new Date() } = {}) {
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  const weights = readHealthWeights(settings);
  const repAverages = await repDiscountAverages(db, settings);

  return quotations.map((quotation) => ({
    quotation,
    health: scoreDealHealth(quotation, {
      settings,
      weights,
      repAverages,
      customerBand: customerBands.get(quotation.customerId) || null,
      now,
    }),
  }));
}
