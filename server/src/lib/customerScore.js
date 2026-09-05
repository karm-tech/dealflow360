// How much we trust a customer, worked out from what they have actually done.
//
// Not the same thing as their tier. A tier is a business decision a person
// makes and it controls the discount they are allowed. This is evidence the
// system collected and it says how safe a deal with them looks. Keeping them
// apart is the point: one is what they are permitted, the other is what they
// have earned.
//
// Derived on read and never stored, so it cannot drift away from the rows it
// came from.

import { INVOICE_STATUS, QUOTATION_STATUS } from "./constants.js";

const START = 100;

// Caps stop any one habit deciding the whole score. A customer who pays late
// but never cancels should not end up in the same band as one who does both.
const PENALTIES = {
  cancelRateWeight: 50,
  cancelRateCap: 40,
  daysLateWeight: 2,
  daysLateCap: 30,
  slowReplyWeight: 2,
  slowReplyCap: 15,
};

// A customer with no order history is unknown, not bad. Punishing them by
// default would push every new account towards the discount ceilings of the
// worst payers we have.
export const NEW_CUSTOMER_SCORE = 70;

const BANDS = [
  { min: 85, band: "TRUSTED", label: "Trusted" },
  { min: 70, band: "RELIABLE", label: "Reliable" },
  { min: 50, band: "WATCH", label: "Watch" },
  { min: 0, band: "RISKY", label: "Risky" },
];

// How much the customer's record costs a deal of theirs. One lookup, so the
// deal health rules never have to know anything about payment history.
export const BAND_DEAL_PENALTY = {
  TRUSTED: 0,
  RELIABLE: 3,
  NEW: 5,
  WATCH: 10,
  RISKY: 15,
};

function round(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function bandFor(score) {
  return BANDS.find((entry) => score >= entry.min) || BANDS[BANDS.length - 1];
}

function daysBetween(from, to) {
  return (new Date(to) - new Date(from)) / 86400000;
}

// Everything the score needs, in one query per customer set.
export const CUSTOMER_SCORE_INCLUDE = {
  quotations: {
    select: {
      id: true,
      status: true,
      createdAt: true,
      confirmedAt: true,
      lastActivityAt: true,
    },
  },
  invoices: {
    select: {
      id: true,
      status: true,
      dueDate: true,
      total: true,
      payments: { select: { amount: true, paidAt: true } },
    },
  },
};

// A deal the customer decided against counts; one we cancelled internally does
// not, because that says something about us rather than about them.
function cancelRateFor(quotations) {
  const decided = quotations.filter((quotation) =>
    [QUOTATION_STATUS.CONFIRMED, QUOTATION_STATUS.REJECTED, QUOTATION_STATUS.CANCELLED].includes(
      quotation.status,
    ),
  );

  if (decided.length === 0) return { rate: 0, decided: 0, lost: 0 };

  const lost = decided.filter((quotation) => quotation.status !== QUOTATION_STATUS.CONFIRMED).length;

  return { rate: lost / decided.length, decided: decided.length, lost };
}

// Measured against the due date, and only on invoices that were actually paid.
// An unpaid invoice is a different problem and is reported separately.
function latenessFor(invoices) {
  const settled = invoices.filter(
    (invoice) => invoice.status === INVOICE_STATUS.PAID && invoice.dueDate && invoice.payments.length,
  );

  if (settled.length === 0) return { avgDaysLate: 0, paidCount: 0, lateCount: 0 };

  let totalDaysLate = 0;
  let lateCount = 0;

  for (const invoice of settled) {
    // The invoice is settled by its last payment, so that is the date that
    // decides whether it was late.
    const settledAt = invoice.payments
      .map((payment) => new Date(payment.paidAt))
      .sort((a, b) => b - a)[0];

    const daysLate = daysBetween(invoice.dueDate, settledAt);
    if (daysLate > 0) {
      totalDaysLate += daysLate;
      lateCount += 1;
    }
  }

  return {
    avgDaysLate: round(totalDaysLate / settled.length),
    paidCount: settled.length,
    lateCount,
  };
}

// How long they sit on a quotation before it moves. Only quotations they went
// on to confirm are measured, since a deal still in play has not finished
// waiting and would look worse the longer it stays open.
function replySpeedFor(quotations) {
  const answered = quotations.filter(
    (quotation) => quotation.status === QUOTATION_STATUS.CONFIRMED && quotation.confirmedAt,
  );

  if (answered.length === 0) return { avgDays: 0, sampleSize: 0 };

  const total = answered.reduce(
    (sum, quotation) => sum + Math.max(0, daysBetween(quotation.createdAt, quotation.confirmedAt)),
    0,
  );

  return { avgDays: round(total / answered.length), sampleSize: answered.length };
}

// Every deduction carries the sentence that explains it, so the number on
// screen can always be defended without anyone rerunning the maths.
export function scoreCustomer(customer) {
  const cancels = cancelRateFor(customer.quotations || []);
  const lateness = latenessFor(customer.invoices || []);
  const replies = replySpeedFor(customer.quotations || []);

  const hasHistory = cancels.decided > 0 || lateness.paidCount > 0;

  if (!hasHistory) {
    return {
      score: NEW_CUSTOMER_SCORE,
      band: "NEW",
      label: "New",
      dealPenalty: BAND_DEAL_PENALTY.NEW,
      reasons: [],
      summary: "New customer, no completed orders yet — unknown rather than risky",
      evidence: { cancels, lateness, replies },
    };
  }

  const reasons = [];

  const cancelPenalty = Math.min(
    PENALTIES.cancelRateCap,
    round(cancels.rate * PENALTIES.cancelRateWeight),
  );
  if (cancelPenalty > 0) {
    reasons.push({
      points: cancelPenalty,
      reason: `lost ${cancelPenalty} for walking away from ${cancels.lost} of ${cancels.decided} deals`,
    });
  }

  const latePenalty = Math.min(
    PENALTIES.daysLateCap,
    round(lateness.avgDaysLate * PENALTIES.daysLateWeight),
  );
  if (latePenalty > 0) {
    reasons.push({
      points: latePenalty,
      reason: `lost ${latePenalty} for paying ${lateness.avgDaysLate} days late on average`,
    });
  }

  const replyPenalty = Math.min(
    PENALTIES.slowReplyCap,
    round(replies.avgDays * PENALTIES.slowReplyWeight),
  );
  if (replyPenalty > 0) {
    reasons.push({
      points: replyPenalty,
      reason: `lost ${replyPenalty} for taking ${replies.avgDays} days to decide`,
    });
  }

  const score = Math.max(
    0,
    round(START - reasons.reduce((total, entry) => total + entry.points, 0)),
  );
  const band = bandFor(score);

  return {
    score,
    band: band.band,
    label: band.label,
    dealPenalty: BAND_DEAL_PENALTY[band.band],
    reasons,
    summary:
      reasons.length === 0
        ? "Pays on time and sees deals through"
        : `${score} = ${reasons.map((entry) => entry.reason).join(", ")}`,
    evidence: { cancels, lateness, replies },
  };
}

// Suggested only, never applied. A discount ceiling is a business decision, so
// the system points at the evidence and a person makes the call.
export function tierSuggestion(customer, score, tiers) {
  const ordered = [...tiers].sort((a, b) => a.maxDiscountPct - b.maxDiscountPct);
  const currentIndex = ordered.findIndex((tier) => tier.id === customer.tierId);
  if (currentIndex === -1) return null;

  // Enough of a record to be worth acting on. Below this the score is a guess
  // and moving someone's ceiling on a guess is how ceilings lose their meaning.
  const decided = score.evidence.cancels.decided;
  if (decided < 3) return null;

  if (score.band === "TRUSTED" && currentIndex < ordered.length - 1) {
    const target = ordered[currentIndex + 1];
    return {
      direction: "PROMOTE",
      toTierId: target.id,
      toTierName: target.name,
      reason: `Scores ${score.score} on ${decided} completed deals. ${target.name} would raise their ceiling to ${target.maxDiscountPct}%.`,
    };
  }

  if (score.band === "RISKY" && currentIndex > 0) {
    const target = ordered[currentIndex - 1];
    return {
      direction: "DEMOTE",
      toTierId: target.id,
      toTierName: target.name,
      reason: `Scores ${score.score} on ${decided} completed deals. ${target.name} would hold their ceiling to ${target.maxDiscountPct}%.`,
    };
  }

  return null;
}
