// The audit trail and the stall clock are written together, in one place, so
// they cannot drift apart.

export async function logActivity(db, { quotationId, userId, action, detail }) {
  await db.$transaction([
    db.activityLog.create({ data: { quotationId, userId, action, detail } }),
    db.quotation.update({ where: { id: quotationId }, data: { lastActivityAt: new Date() } }),
  ]);
}

// For events that belong to no quotation, such as receiving stock or changing a
// setting. There is no stall clock to refresh, so only the trail is written.
export async function logEvent(db, { userId, action, detail }) {
  await db.activityLog.create({ data: { quotationId: null, userId, action, detail } });
}

// Belongs to a quotation but is not progress on it: chasing a deal, or putting
// it in front of a manager. The trail records it, the stall clock does not move.
// Otherwise nudging a stalled deal would clear its own alert and the deal would
// look healthy again without anyone having actually done anything to it.
export async function logWithoutProgress(db, { quotationId, userId, action, detail }) {
  await db.activityLog.create({ data: { quotationId, userId, action, detail } });
}

// Describes a change as "field: before → after" for the history timeline.
export function describeChange(label, before, after) {
  const from = before === null || before === undefined || before === "" ? "empty" : before;
  const to = after === null || after === undefined || after === "" ? "empty" : after;
  return `${label}: ${from} → ${to}`;
}
