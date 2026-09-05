// Which statuses may be edited, and where a quotation goes when it is confirmed.

import { QUOTATION_STATUS } from "./constants.js";
import { scoreQuotation } from "./risk.js";
import { buildChain, findBand, rolesForBand, stepRowsFor } from "./approvals.js";

// A quotation is open for changes while it is being written, and again after a
// reviewer returns it. While it sits with a reviewer, or once it is agreed, it
// is fixed.
const EDITABLE_STATUSES = [QUOTATION_STATUS.DRAFT, "RETURNED"];

export function isEditable(status) {
  return EDITABLE_STATUSES.includes(status);
}

export function editBlockedMessage(status) {
  if (status === QUOTATION_STATUS.PENDING_APPROVAL) {
    return "This quotation is with an approver and cannot be changed.";
  }
  if (status === QUOTATION_STATUS.CANCELLED) {
    return "This quotation was cancelled.";
  }
  return "This quotation has been agreed and cannot be changed.";
}

// What confirming would do, without doing it. Same routing as the confirm, so
// the preview a rep sees cannot disagree with the decision.
export async function previewRouting(db, quotation) {
  const plan = await resolveConfirmTarget(db, quotation);

  return {
    score: plan.risk.score,
    roles: (plan.chain || []).map((entry) => entry.role),
    error: plan.error || null,
  };
}

// Decides where a quotation goes when the rep confirms it. Returns a plan for
// the route to apply; nothing is written here.
//
// A quotation inside its ceilings is approved on the spot. It still goes to the
// customer afterwards — skipping approval is not the same as closing the deal.
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

  // Every role in the band was ruled out. Approving anyway would turn deleting
  // an approver into a way around the ceilings, so the confirm is refused.
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
