// Outbound mail. Rows are kept in the database so a restart does not lose the
// record and an admin can read back what was sent.
//
// Delivery is attempted through the SMTP settings held in the database. With no
// host set a message stays QUEUED and the outbox screen is the delivery record.

import { deliver, isSmtpConfigured } from "./mailer.js";

export async function queueEmail(db, { to, subject, body, quotationId = null, attachment = null }) {
  return deliver(db, { to, subject, body, quotationId, attachment });
}

export async function listEmails(db, limit = 100) {
  return db.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

export { isSmtpConfigured };
