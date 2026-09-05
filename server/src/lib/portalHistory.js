// What the customer is told happened to their quotation.
//
// The activity log is written for the people who work here: it carries risk
// scores, approval routing and internal status names. None of that is the
// customer's business, so rather than filter the wording this maps the handful
// of events they should see onto sentences written for them. Anything not
// listed simply does not reach the portal.

const CUSTOMER_VISIBLE = {
  QUOTATION_CREATED: "Request received",
  QUOTATION_CONFIRMED: "We started pricing your request",
  QUOTATION_APPROVED: "Your quotation was finalised",
  QUOTATION_SENT: "Quotation sent to you",
  QUOTATION_ACCEPTED: "You approved this quotation",
  QUOTATION_REJECTED_BY_CUSTOMER: "You sent this back with your reasons",
  FULFILMENT_ACCEPTED: "Stock set aside for your order",
  BACKORDER_RAISED: "Part of your order is on backorder",
  INVOICE_RAISED: "Invoice raised",
  PAYMENT_RECORDED: "Payment received, thank you",
  SUBSCRIPTIONS_STARTED: "Your recurring plan started",
  RENEWAL_BILLED: "Your recurring plan was billed for the new period",
};

// Oldest first: the customer is reading a story, not scanning for the latest
// change the way the internal form is.
export function portalHistory(activityLogs) {
  return activityLogs
    .filter((log) => CUSTOMER_VISIBLE[log.action])
    .map((log) => ({
      id: log.id,
      action: log.action,
      label: CUSTOMER_VISIBLE[log.action],
      at: log.createdAt,
    }))
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}
