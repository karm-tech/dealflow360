// Shapes what the browser receives. Margin never leaves the building: it is
// added only for internal roles, so no customer-facing response can carry it.

import { APPROVAL_STATUS, INTERNAL_ROLES } from "./constants.js";
import { quotationTotals } from "./pricing.js";
import { isEditable } from "./quotationRules.js";
import { scoreQuotation } from "./risk.js";

export const QUOTATION_INCLUDE = {
  customer: { include: { tier: true } },
  rep: { select: { id: true, name: true, email: true } },
  lines: {
    include: { product: { include: { category: true } }, plan: true },
    orderBy: { id: "asc" },
  },
  approvalSteps: {
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { sequence: "asc" },
  },
};

function isInternal(role) {
  return INTERNAL_ROLES.includes(role);
}

export function quotationSummary(quotation) {
  const totals = quotationTotals(quotation.lines);

  return {
    id: quotation.id,
    number: quotation.number,
    status: quotation.status,
    customer: {
      id: quotation.customer.id,
      name: quotation.customer.name,
      tier: quotation.customer.tier.name,
    },
    rep: quotation.rep ? quotation.rep.name : null,
    lineCount: quotation.lines.length,
    riskScore: quotation.riskScore,
    annualContractValue: totals.annualContractValue,
    grandTotal: totals.grandTotal,
    requestedDeliveryDate: quotation.requestedDeliveryDate,
    lastActivityAt: quotation.lastActivityAt,
    createdAt: quotation.createdAt,
  };
}

function lineView(line, figures) {
  return {
    id: line.id,
    productId: line.productId,
    productName: line.product.name,
    sku: line.product.sku,
    category: line.product.category.name,
    unit: line.product.unit,
    qty: line.qty,
    unitPrice: line.unitPrice,
    discountPct: line.discountPct,
    billingType: line.billingType,
    planId: line.planId,
    planName: line.plan ? line.plan.name : null,
    startDate: line.startDate,
    isStockable: line.product.isStockable,
    taxRatePct: figures.taxRatePct,
    net: figures.net,
    taxAmount: figures.taxAmount,
    total: figures.total,
    monthlyNet: figures.monthlyNet,
    isProrated: figures.isProrated,
  };
}

export function quotationDetail(quotation, { role, activityLogs = [], suggestions = [], routing = null } = {}) {
  const totals = quotationTotals(quotation.lines);
  const internal = isInternal(role);

  const view = {
    id: quotation.id,
    number: quotation.number,
    status: quotation.status,
    isEditable: isEditable(quotation.status),
    customer: {
      id: quotation.customer.id,
      name: quotation.customer.name,
      email: quotation.customer.email,
      phone: quotation.customer.phone,
      city: quotation.customer.city,
      tierId: quotation.customer.tierId,
      tier: quotation.customer.tier.name,
      maxDiscountPct: quotation.customer.tier.maxDiscountPct,
    },
    rep: quotation.rep ? { id: quotation.rep.id, name: quotation.rep.name } : null,
    inquiryDate: quotation.inquiryDate,
    requestedDeliveryDate: quotation.requestedDeliveryDate,
    notes: quotation.notes,
    confirmedAt: quotation.confirmedAt,
    createdAt: quotation.createdAt,
    lastActivityAt: quotation.lastActivityAt,
    lines: quotation.lines.map((line, index) => lineView(line, totals.lineFigures[index])),
    totals: {
      oneTimeNet: totals.oneTimeNet,
      recurringMonthlyNet: totals.recurringMonthlyNet,
      firstInvoiceNet: totals.firstInvoiceNet,
      taxAmount: totals.taxAmount,
      grandTotal: totals.grandTotal,
      annualContractValue: totals.annualContractValue,
    },
    history: activityLogs.map((log) => ({
      id: log.id,
      action: log.action,
      detail: log.detail,
      by: log.user ? log.user.name : "System",
      at: log.createdAt,
    })),
  };

  if (internal) {
    view.totals.marginPct = totals.marginPct;
    view.totals.annualCost = totals.annualCost;
    view.suggestions = suggestions;
    // Ceilings and overages are internal governance, never shown to a customer.
    view.risk = scoreQuotation(quotation);
    view.approval = approvalView(quotation.approvalSteps || []);
    // What confirming would do right now, worked out by the same routing the
    // confirm itself uses.
    view.routing = routing;
  }

  return view;
}

// The chain as the screen shows it: every step, where it has got to, and who
// acted.
function approvalView(steps) {
  return {
    steps: steps.map((step) => ({
      id: step.id,
      sequence: step.sequence,
      role: step.role,
      status: step.status,
      actor: step.actor ? step.actor.name : null,
      reason: step.reason,
      actedAt: step.actedAt,
    })),
    currentStepId: steps.find((step) => step.status === APPROVAL_STATUS.PENDING)?.id || null,
  };
}
