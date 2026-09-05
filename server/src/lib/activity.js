// The audit trail and the stall clock are written together, in one place, so
// they cannot drift apart.

export async function logActivity(db, { quotationId, userId, action, detail }) {
  await db.$transaction([
    db.activityLog.create({ data: { quotationId, userId, action, detail } }),
    db.quotation.update({ where: { id: quotationId }, data: { lastActivityAt: new Date() } }),
  ]);
}

// Describes a change as "field: before → after" for the history timeline.
export function describeChange(label, before, after) {
  const from = before === null || before === undefined || before === "" ? "empty" : before;
  const to = after === null || after === undefined || after === "" ? "empty" : after;
  return `${label}: ${from} → ${to}`;
}
