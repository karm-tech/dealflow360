// Agreeing an order is the same event whether the customer clicked it in the
// portal or told a rep who recorded it. Both routes come through here, so the
// two can never drift into taking stock or raising invoices differently.

import { QUOTATION_STATUS } from "./constants.js";
import { logActivity, describeChange } from "./activity.js";
import { executeFulfilment } from "./fulfilmentService.js";
import { billConfirmedOrder } from "./billingService.js";
import { notify, NOTIFICATION_TYPES } from "./notify.js";

const ACCEPTABLE = [QUOTATION_STATUS.APPROVED, QUOTATION_STATUS.SENT];

export function canAccept(status) {
  return ACCEPTABLE.includes(status);
}

// `by` is how the acceptance is described in the history and the alert, since
// the customer clicking it and a rep recording it read differently.
export async function acceptQuotation(db, mode, quotation, userId, by) {
  if (!canAccept(quotation.status)) {
    return { error: "Only an approved quotation can be accepted" };
  }

  await db.quotation.update({
    where: { id: quotation.id },
    data: { status: QUOTATION_STATUS.CONFIRMED, confirmedAt: new Date() },
  });

  await logActivity(db, {
    quotationId: quotation.id,
    userId,
    action: "QUOTATION_ACCEPTED",
    detail: `${describeChange("Status", quotation.status, QUOTATION_STATUS.CONFIRMED)} · ${by}`,
  });

  // Agreeing the order is what takes the stock. A quotation that never gets
  // this far holds none.
  const confirmed = { ...quotation, status: QUOTATION_STATUS.CONFIRMED };
  const fulfilment = await executeFulfilment(db, mode, confirmed, userId);
  if (fulfilment.error) return { error: fulfilment.error };

  // Agreeing the order also raises its opening invoice and opens a
  // subscription for each recurring line.
  await billConfirmedOrder(db, mode, confirmed, userId);

  const approvers = await db.user.findMany({
    where: { id: { in: quotation.approvalSteps.map((step) => step.actorId).filter(Boolean) } },
    select: { id: true, email: true, name: true },
  });

  await notify(db, mode, {
    users: [quotation.rep, ...approvers].filter((user) => user && user.id !== userId),
    type: NOTIFICATION_TYPES.QUOTATION_ACCEPTED,
    title: `${quotation.number} accepted by ${quotation.customer.name}`,
    body: "The quotation is now a confirmed order.",
    quotationId: quotation.id,
  });

  return {};
}
