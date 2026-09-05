// Frontend copy of the values the API uses. Kept small on purpose — the server
// is the source of truth, this is only for labels and styling.

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

// The order demo accounts are listed in on the login screen: most powerful
// first, customers last because they open a different app entirely.
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

// A tone name, not Tailwind classes. StatusPill turns it into colour, so the
// status palette lives in exactly one place and a screen can never invent its
// own shade of "approved".
export const USER_STATUS_TONES = {
  PENDING: "warn",
  ACTIVE: "ok",
  REJECTED: "bad",
  DISABLED: "neutral",
};

export const QUOTATION_STATUS_LABELS = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  SENT: "Sent",
  UNDER_NEGOTIATION: "Under Negotiation",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
};

// "info" means work is under way on our side and nothing is wrong — it uses the
// navy tint rather than a status colour, so it never reads as a warning.
export const QUOTATION_STATUS_TONES = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warn",
  APPROVED: "ok",
  SENT: "info",
  UNDER_NEGOTIATION: "warn",
  CONFIRMED: "ok",
  CANCELLED: "bad",
};

export const BILLING_TYPE_LABELS = {
  ONE_TIME: "One-time",
  RECURRING: "Recurring",
};
