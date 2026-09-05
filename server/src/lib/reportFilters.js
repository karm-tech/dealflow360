// Shared quotation filters for the dashboard, the reports screen and the
// PDF / XLS exports, so the three never answer a different question.

import { QUOTATION_STATUS, ROLES } from "./constants.js";

export const APPROVAL_FILTERS = {
  pending: QUOTATION_STATUS.PENDING_APPROVAL,
  approved: QUOTATION_STATUS.APPROVED,
  rejected: QUOTATION_STATUS.REJECTED,
};

export function parseReportQuery(query, user) {
  return {
    period: String(query.period || "all"),
    from: parseDay(query.from),
    to: parseDay(query.to),
    repId: query.repId ? Number(query.repId) : null,
    approval: query.approval ? String(query.approval) : "",
    categoryId: query.categoryId ? Number(query.categoryId) : null,
    productId: query.productId ? Number(query.productId) : null,
    user,
  };
}

function parseDay(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateRange(filters) {
  const now = new Date();

  if (filters.period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { gte: start };
  }

  if (filters.period === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { gte: start };
  }

  if (filters.period === "custom") {
    const range = {};
    if (filters.from) {
      const start = new Date(filters.from);
      start.setHours(0, 0, 0, 0);
      range.gte = start;
    }
    if (filters.to) {
      const end = new Date(filters.to);
      end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
    return Object.keys(range).length ? range : null;
  }

  return null;
}

export function quotationReportWhere(filters) {
  const where = {};

  if (filters.user.role === ROLES.SALES_REP) {
    where.repId = filters.user.id;
  } else if (filters.repId) {
    where.repId = filters.repId;
  }

  const createdAt = dateRange(filters);
  if (createdAt) where.createdAt = createdAt;

  if (filters.approval && APPROVAL_FILTERS[filters.approval]) {
    where.status = APPROVAL_FILTERS[filters.approval];
  }

  if (filters.productId) {
    where.lines = { some: { productId: filters.productId } };
  } else if (filters.categoryId) {
    where.lines = { some: { product: { categoryId: filters.categoryId } } };
  }

  return where;
}

export function reportPeriodLabel(filters) {
  if (filters.period === "today") return "Today";
  if (filters.period === "week") return "Last 7 days";
  if (filters.period === "custom") {
    const from = filters.from ? filters.from.toISOString().slice(0, 10) : "start";
    const to = filters.to ? filters.to.toISOString().slice(0, 10) : "now";
    return `${from} to ${to}`;
  }
  return "All time";
}
