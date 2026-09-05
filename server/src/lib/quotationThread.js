// One thread per quotation. The socket only pokes the other side; the row
// in PortalMessage is what both screens read after a refresh.

import { ROLES } from "./constants.js";
import { canMessage } from "./quotationRules.js";
import { logActivity } from "./activity.js";
import { notify, NOTIFICATION_TYPES } from "./notify.js";

export async function postQuotationMessage(db, dbMode, { quotation, authorId, text }) {
  if (!canMessage(quotation.status)) {
    return { error: "This quotation is closed for messages." };
  }

  const trimmed = String(text || "").trim();
  if (trimmed.length < 1) return { error: "Write a message first." };
  if (trimmed.length > 2000) return { error: "Keep the message under 2000 characters." };

  const author = await db.user.findUnique({
    where: { id: authorId },
    select: { id: true, name: true, role: true },
  });
  if (!author) return { error: "Your account is no longer active." };

  await db.portalMessage.create({
    data: {
      quotationId: quotation.id,
      authorId: author.id,
      text: trimmed,
    },
  });

  await logActivity(db, {
    quotationId: quotation.id,
    userId: author.id,
    action: "QUOTATION_MESSAGE",
    detail: `${author.name} wrote on ${quotation.number}`,
  });

  const fromCustomer = author.role === ROLES.CUSTOMER;
  const recipients = fromCustomer
    ? [quotation.rep]
    : await db.user.findMany({
        where: { customerId: quotation.customerId, role: ROLES.CUSTOMER, status: "ACTIVE" },
        select: { id: true, email: true, name: true },
      });

  await notify(db, dbMode, {
    users: recipients,
    type: NOTIFICATION_TYPES.QUOTATION_MESSAGE,
    title: fromCustomer
      ? `${quotation.customer.name} wrote on ${quotation.number}`
      : `A message on quotation ${quotation.number}`,
    body: trimmed,
    quotationId: quotation.id,
  });

  return { ok: true };
}
