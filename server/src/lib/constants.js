// The allowed values for every "enum" column in the schema.
// SQLite has no enum type, so these lists are how we keep the strings honest.
// The frontend has its own copy in src/lib/constants.js — keep them in step.

export const ROLES = {
  ADMIN: "ADMIN",
  SALES_REP: "SALES_REP",
  SALES_MANAGER: "SALES_MANAGER",
  FINANCE: "FINANCE",
  CUSTOMER: "CUSTOMER",
};

// Roles that belong to the company, as opposed to a customer portal login.
export const INTERNAL_ROLES = [
  ROLES.ADMIN,
  ROLES.SALES_REP,
  ROLES.SALES_MANAGER,
  ROLES.FINANCE,
];

// Roles an admin may hand out when approving an access request. Deliberately
// the internal list — approving someone into a customer portal login makes no
// sense, because a portal user belongs to a customer record.
export const ASSIGNABLE_ROLES = INTERNAL_ROLES;

// Where an account stands. Only ACTIVE can log in.
export const USER_STATUS = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  REJECTED: "REJECTED",
  DISABLED: "DISABLED",
};

// Which database a session is working against. Carried inside the login token.
export const DB_MODES = {
  LIVE: "live",
  DEMO: "demo",
};

// A quotation becomes an order by reaching CONFIRMED. Same row throughout.
export const QUOTATION_STATUS = {
  DRAFT: "DRAFT",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  SENT: "SENT",
  UNDER_NEGOTIATION: "UNDER_NEGOTIATION",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
};

// Decides how a line is billed. Nothing else does.
export const BILLING_TYPE = {
  ONE_TIME: "ONE_TIME",
  RECURRING: "RECURRING",
};

export const APPROVAL_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  RETURNED: "RETURNED",
};

export const FULFILMENT_STATUS = {
  SUGGESTED: "SUGGESTED",
  ACCEPTED: "ACCEPTED",
  BACKORDER: "BACKORDER",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  RETURNED: "RETURNED",
};

export const SUBSCRIPTION_STATUS = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  CANCELLED: "CANCELLED",
  ENDED: "ENDED",
};

export const INVOICE_STATUS = {
  DRAFT: "DRAFT",
  ISSUED: "ISSUED",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
};

export const PAYMENT_METHODS = ["CASH", "BANK", "CARD", "UPI"];

export const PLAN_INTERVALS = {
  MONTH: "MONTH",
  QUARTER: "QUARTER",
  YEAR: "YEAR",
};
