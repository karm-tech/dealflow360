// Records outbound mail until SMTP is wired up, so the flow stays complete and
// inspectable without network access.
//
// TODO: send through nodemailer when SMTP settings are present in .env.

const messages = [];

export function queueEmail({ to, subject, body }) {
  const message = { to, subject, body, queuedAt: new Date() };
  messages.push(message);

  console.log(`[outbox] to: ${to} | ${subject}`);
  return message;
}

export function listEmails() {
  return messages;
}
