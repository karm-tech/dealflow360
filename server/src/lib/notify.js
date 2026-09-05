// One call reaches a person three ways: an in-app alert, an email, and a live
// event so an open screen updates without a refresh.
//
// Every event notifies everyone it concerns. A production system would batch
// these into a digest or let people choose per event type.

import { queueEmail } from "./outbox.js";
import { emitToUser } from "./realtime.js";

export const NOTIFICATION_TYPES = {
  APPROVAL_REQUESTED: "APPROVAL_REQUESTED",
  APPROVAL_ESCALATED: "APPROVAL_ESCALATED",
  QUOTATION_APPROVED: "QUOTATION_APPROVED",
  QUOTATION_REJECTED: "QUOTATION_REJECTED",
  QUOTATION_RETURNED: "QUOTATION_RETURNED",
  QUOTATION_ACCEPTED: "QUOTATION_ACCEPTED",
};

export async function notify(db, mode, { users, type, title, body, quotationId = null }) {
  const recipients = (users || []).filter(Boolean);
  if (recipients.length === 0) return;

  await db.notification.createMany({
    data: recipients.map((user) => ({ userId: user.id, type, title, body, quotationId })),
  });

  for (const user of recipients) {
    await queueEmail(db, { to: user.email, subject: title, body: body || title, quotationId });
    emitToUser(mode, user.id, "notification", { type, title, body, quotationId });
  }
}

// Everyone holding a role, used when a step is offered to a pool rather than a
// named person.
export async function usersInRole(db, role, excludeUserId) {
  return db.user.findMany({
    where: {
      role,
      status: "ACTIVE",
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true, email: true, name: true },
  });
}
