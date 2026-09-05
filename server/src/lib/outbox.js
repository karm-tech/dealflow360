// Email outbox.
//
// SMTP is not wired up yet (Phase 9 does that with nodemailer). Until then any
// mail the app wants to send is recorded here and printed to the server log, so
// the workflow is complete and demonstrable even with no internet — which the
// hackathon guidelines ask for.
//
// TODO (Phase 9): when SMTP settings are present in .env, send through
// nodemailer and fall back to this outbox when they are blank.

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
