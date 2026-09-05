// Email outbox.
//
// SMTP is not wired up yet. Until then any mail the app wants to send is
// recorded here and printed to the server log, so the workflow is complete and
// inspectable with no network access.
//
// TODO: when SMTP settings are present in .env, send through nodemailer and
// fall back to this outbox when they are blank.

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
