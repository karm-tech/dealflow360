// The body of the renewal notice. Kept apart from the service so the wording
// can be read and changed without going near the logic that raises the draft.

function formatDate(value) {
  return new Date(value).toDateString();
}

function formatAmount(value) {
  return value.toFixed(2);
}

export function renewalEmail({
  repName,
  customerName,
  productName,
  quotationNumber,
  subscriptionReference,
  periodStart,
  periodEnd,
  amount,
  planName,
}) {
  return [
    `Hello ${repName},`,
    "",
    `${subscriptionReference} renews on ${formatDate(periodStart)} and a draft quotation is waiting for you.`,
    "",
    `  Customer      ${customerName}`,
    `  Product       ${productName}`,
    `  Plan          ${planName}`,
    `  Period        ${formatDate(periodStart)} to ${formatDate(periodEnd)}`,
    `  Amount        ${formatAmount(amount)}`,
    `  Quotation     ${quotationNumber}`,
    "",
    "Review the figures, then send it for the customer to agree.",
    "Nothing is billed or shipped until they do.",
  ].join("\n");
}
