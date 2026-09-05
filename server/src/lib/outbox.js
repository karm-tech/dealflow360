// Outbound mail. Rows are kept in the database so a restart does not lose the
// record and an admin can read back what was sent.
//
// TODO: send through nodemailer when SMTP settings are present in .env; until
// then a message stays QUEUED and the outbox screen is the delivery record.

const SMTP_CONFIGURED = Boolean(process.env.SMTP_HOST);

export async function queueEmail(db, { to, subject, body, quotationId = null }) {
  const message = await db.emailMessage.create({
    data: { to, subject, body, quotationId, status: "QUEUED" },
  });

  console.log(`[outbox] to: ${to} | ${subject}`);
  return message;
}

export async function listEmails(db, limit = 100) {
  return db.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

export function isSmtpConfigured() {
  return SMTP_CONFIGURED;
}
