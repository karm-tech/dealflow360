// Puts the current quotation in front of the customer. Used on the first send
// and again after a revision, so the attachment always matches the record now.

import { ROLES } from "./constants.js";
import { logActivity, describeChange } from "./activity.js";
import { notify, NOTIFICATION_TYPES } from "./notify.js";
import { queueEmail } from "./outbox.js";
import { quotationPdf, quotationPdfName } from "./pdf/quotationPdf.js";
import { companySettings } from "./company.js";

export async function hasBeenSentToCustomer(db, quotationId) {
  const row = await db.activityLog.findFirst({
    where: {
      quotationId,
      action: { in: ["QUOTATION_SENT", "QUOTATION_NEGOTIATED"] },
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function deliverToCustomer(db, dbMode, quotation, userId, { isResend = false } = {}) {
  const portalUsers = await db.user.findMany({
    where: { customerId: quotation.customerId, role: ROLES.CUSTOMER, status: "ACTIVE" },
    select: { id: true, email: true, name: true },
  });

  const body = isResend
    ? `${quotation.customer.name} — we have revised quotation ${quotation.number}. The updated quotation is attached. Sign in to the portal to accept it, request further changes, or turn it down.`
    : `${quotation.customer.name} — quotation ${quotation.number} is ready for you. The full quotation is attached. Sign in to the portal to read it there and accept it, request changes, or turn it down.`;

  const { company, currency } = await companySettings(db);
  const attachment = {
    filename: quotationPdfName(quotation),
    content: await quotationPdf(quotation, company, currency),
  };

  await logActivity(db, {
    quotationId: quotation.id,
    userId,
    action: "QUOTATION_SENT",
    detail: isResend
      ? `Sent to ${quotation.customer.name} again`
      : `${describeChange("Status", quotation.status, "SENT")} · sent to ${quotation.customer.name}`,
  });

  if (portalUsers.length > 0) {
    await notify(db, dbMode, {
      users: portalUsers,
      type: NOTIFICATION_TYPES.QUOTATION_SENT,
      title: isResend
        ? `Revised quotation ${quotation.number} is ready`
        : `Quotation ${quotation.number} is ready for you`,
      body,
      quotationId: quotation.id,
      attachment,
    });
    return { reachedPortal: true };
  }

  await queueEmail(db, {
    to: quotation.customer.email,
    subject: isResend
      ? `Revised quotation ${quotation.number} is ready`
      : `Quotation ${quotation.number} is ready for you`,
    body: `${body}\n\nYou do not have a portal account yet — register with this email address to follow it online.`,
    quotationId: quotation.id,
    attachment,
  });

  return { reachedPortal: false };
}

export function deliveryMessage(result, customer) {
  return result.reachedPortal
    ? `Sent to ${customer.name}`
    : `Emailed ${customer.email} — nobody there has a portal account yet`;
}
