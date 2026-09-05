// Frontend copy of the API's values, for labels and styling only. The server is
// the source of truth.

export const ROLES = {
  ADMIN: "ADMIN",
  SALES_REP: "SALES_REP",
  SALES_MANAGER: "SALES_MANAGER",
  FINANCE: "FINANCE",
  CUSTOMER: "CUSTOMER",
};

export const ROLE_LABELS = {
  ADMIN: "Admin",
  SALES_REP: "Sales Rep",
  SALES_MANAGER: "Sales Manager",
  FINANCE: "Finance",
  CUSTOMER: "Customer",
};

// Listing order on the demo page: most powerful first, customers last.
export const ROLE_ORDER = [
  ROLES.ADMIN,
  ROLES.SALES_MANAGER,
  ROLES.FINANCE,
  ROLES.SALES_REP,
  ROLES.CUSTOMER,
];

// Which instance a session is working against.
export const DB_MODES = {
  LIVE: "live",
  DEMO: "demo",
};

export const USER_STATUS = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  REJECTED: "REJECTED",
  DISABLED: "DISABLED",
};

export const USER_STATUS_LABELS = {
  PENDING: "Waiting for approval",
  ACTIVE: "Active",
  REJECTED: "Declined",
  DISABLED: "Disabled",
};

// A tone name, not Tailwind classes: StatusPill maps it to colour so the status
// palette lives in one place.
export const USER_STATUS_TONES = {
  PENDING: "warn",
  ACTIVE: "ok",
  REJECTED: "bad",
  DISABLED: "neutral",
};

export const APPROVAL_STATUS_LABELS = {
  WAITING: "Waiting its turn",
  PENDING: "Waiting on you",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  RETURNED: "Returned",
  SKIPPED: "Not needed",
};

export const APPROVAL_STATUS_TONES = {
  WAITING: "neutral",
  PENDING: "warn",
  APPROVED: "ok",
  REJECTED: "bad",
  RETURNED: "warn",
  SKIPPED: "neutral",
};

export const QUOTATION_STATUS_LABELS = {
  DRAFT: "Draft",
  RETURNED: "Returned for revision",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  SENT: "Sent",
  UNDER_NEGOTIATION: "Under Negotiation",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
};

// "info" is work in progress, not a warning: it uses the navy tint rather than
// a status colour.
export const QUOTATION_STATUS_TONES = {
  DRAFT: "neutral",
  RETURNED: "warn",
  PENDING_APPROVAL: "warn",
  APPROVED: "ok",
  SENT: "info",
  UNDER_NEGOTIATION: "warn",
  CONFIRMED: "ok",
  CANCELLED: "bad",
};

// The path a deal normally takes, shown as a status bar on the quotation.
// Cancelled and Under Negotiation sit off this path and are shown as a pill.
export const QUOTATION_STAGES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT",
  "CONFIRMED",
];

// Columns on the pipeline board.
export const PIPELINE_STAGES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT",
  "UNDER_NEGOTIATION",
  "CONFIRMED",
];

export const FULFILMENT_STATUS_LABELS = {
  SUGGESTED: "Suggested",
  ACCEPTED: "Allocated",
  BACKORDER: "On backorder",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
};

export const FULFILMENT_STATUS_TONES = {
  SUGGESTED: "info",
  ACCEPTED: "ok",
  BACKORDER: "warn",
  SHIPPED: "info",
  DELIVERED: "ok",
  RETURNED: "neutral",
};

export const BILLING_TYPE = {
  ONE_TIME: "ONE_TIME",
  RECURRING: "RECURRING",
};

export const BILLING_TYPE_LABELS = {
  ONE_TIME: "One-time",
  RECURRING: "Recurring",
};
