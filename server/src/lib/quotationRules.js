// Which statuses may be edited, and where a quotation goes when it is confirmed.

import { QUOTATION_STATUS } from "./constants.js";
import { scoreQuotation } from "./risk.js";
import { buildChain, findBand, rolesForBand, stepRowsFor } from "./approvals.js";

const EDITABLE_STATUSES = [QUOTATION_STATUS.DRAFT, "RETURNED", QUOTATION_STATUS.UNDER_NEGOTIATION];

// A closed deal has no one to write to. Drafts are still being priced.
const MESSAGEABLE_STATUSES = [
  QUOTATION_STATUS.PENDING_APPROVAL,
  QUOTATION_STATUS.APPROVED,
  QUOTATION_STATUS.SENT,
  QUOTATION_STATUS.UNDER_NEGOTIATION,
  QUOTATION_STATUS.CONFIRMED,
];

export function canMessage(status) {
  return MESSAGEABLE_STATUSES.includes(status);
}

export function isEditable(status) {
  return EDITABLE_STATUSES.includes(status);
}

export function editBlockedMessage(status) {
  if (status === QUOTATION_STATUS.PENDING_APPROVAL) {
    return "This quotation is with an approver and cannot be changed.";
  }
  if (status === QUOTATION_STATUS.SENT) {
    return "This quotation is with the customer. Wait for their decision, or they can request changes.";
  }
  if (status === QUOTATION_STATUS.CANCELLED) {
    return "This quotation was cancelled.";
  }
  return "This quotation has been agreed and cannot be changed.";
}

// A revision that stays inside ceilings goes back to the portal, not to
// APPROVED — the customer is already waiting on this number.
export function statusAfterConfirm(planStatus, currentStatus) {
  if (currentStatus === QUOTATION_STATUS.UNDER_NEGOTIATION && planStatus === QUOTATION_STATUS.APPROVED) {
    return QUOTATION_STATUS.SENT;
  }
  return planStatus;
}

// Same routing as confirm, so the preview cannot disagree with the decision.
export async function previewRouting(db, quotation) {
  const plan = await resolveConfirmTarget(db, quotation);

  return {
    score: plan.risk.score,
    roles: (plan.chain || []).map((entry) => entry.role),
    error: plan.error || null,
  };
}

// Plan only — the route writes the status. In-ceiling quotes skip the chain
// but still go to the customer; skipping approval is not closing the deal.
export async function resolveConfirmTarget(db, quotation) {
  const risk = scoreQuotation(quotation);
  const band = await findBand(db, risk.score);
  const roles = rolesForBand(band);

  if (roles.length === 0) {
    return {
      status: QUOTATION_STATUS.APPROVED,
      risk,
      steps: [],
      requiresFinance: false,
    };
  }

  const chain = await buildChain(db, roles, quotation.repId);

  // Empty chain after filtering: refuse rather than auto-approve around a missing approver.
  if (chain.length === 0) {
    return {
      error: "No approver available for this discount level — contact an admin.",
      risk,
    };
  }

  return {
    status: QUOTATION_STATUS.PENDING_APPROVAL,
    risk,
    chain,
    steps: stepRowsFor(chain),
    requiresFinance: chain.some((entry) => entry.role === "FINANCE"),
  };
}
