// Sending is an attempt, not a guarantee. Every message is written to the
// outbox first and only then handed to the mail server, so the record of what
// the system decided to send survives a mail server that is down, misconfigured
// or absent altogether.

import nodemailer from "nodemailer";

// Settings are read per send rather than cached, so changing the host on the
// settings screen takes effect on the next message with no restart.
async function smtpSettings(db) {
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  if (!settings?.smtpHost) return null;

  return {
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPassword || "" } : undefined,
    from: settings.smtpFrom || settings.companyEmail || settings.smtpUser,
  };
}

export async function isSmtpConfigured(db) {
  return Boolean(await smtpSettings(db));
}

function transportFor(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    // A mail server that never answers must not hold a request open.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

export async function verifySmtp(db) {
  const config = await smtpSettings(db);
  if (!config) return { ok: false, error: "No SMTP host is set" };

  try {
    await transportFor(config).verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// Returns the outbox row either way. A caller never has to care whether mail
// actually went out, which keeps delivery out of the business rules.
export async function deliver(db, { to, subject, body, quotationId = null, attachment = null }) {
  const message = await db.emailMessage.create({
    data: {
      to,
      subject,
      body,
      quotationId,
      status: "QUEUED",
      attachmentName: attachment?.filename || null,
    },
  });

  const config = await smtpSettings(db);
  if (!config) {
    console.log(`[outbox] queued for ${to} | ${subject}`);
    return message;
  }

  try {
    await transportFor(config).sendMail({
      from: config.from,
      to,
      subject,
      text: body,
      attachments: attachment ? [{ filename: attachment.filename, content: attachment.content }] : [],
    });

    return db.emailMessage.update({
      where: { id: message.id },
      data: { status: "SENT", sentAt: new Date(), error: null },
    });
  } catch (error) {
    console.error(`[outbox] send failed for ${to}: ${error.message}`);

    // Left as FAILED with the reason rather than retried, so the outbox screen
    // shows an admin exactly which message needs attention and why.
    return db.emailMessage.update({
      where: { id: message.id },
      data: { status: "FAILED", error: error.message },
    });
  }
}

// A one-off that bypasses the outbox: it proves the settings work and is not
// part of the record of what customers were sent.
export async function sendTestEmail(db, to) {
  const config = await smtpSettings(db);
  if (!config) return { ok: false, error: "No SMTP host is set" };

  const settings = await db.settings.findUnique({ where: { id: 1 } });

  try {
    await transportFor(config).sendMail({
      from: config.from,
      to,
      subject: `Mail settings test from ${settings.companyName}`,
      text:
        `This is a test message from ${settings.companyName}.\n\n` +
        `If you are reading it, outgoing mail is working and quotations will reach your customers.\n\n` +
        `Sent via ${config.host}:${config.port}.`,
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
