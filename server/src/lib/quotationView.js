// Shapes what the browser receives. Margin never leaves the building: it is
// added only for internal roles, so no customer-facing response can carry it.

import { APPROVAL_STATUS, INTERNAL_ROLES, ROLES } from "./constants.js";
import { quotationTotals } from "./pricing.js";
import { isEditable, canMessage } from "./quotationRules.js";
import { scoreQuotation } from "./risk.js";
import { onHandQty, shortStockLines } from "./stock.js";
import { defaultRenewalLeadDays, maxRenewalLeadDays } from "./renewal.js";
import { variantLabel } from "./variants.js";

export const QUOTATION_INCLUDE = {
  customer: { include: { tier: true } },
  rep: { select: { id: true, name: true, email: true } },
  lines: {
    include: { product: { include: { category: true, stocks: true } }, plan: true, variant: true },
    orderBy: { id: "asc" },
  },
  approvalSteps: {
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { sequence: "asc" },
  },
  renewsSubscription: { select: { id: true, reference: true } },
  portalMessages: {
    include: { author: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "asc" },
  },
  // Counted rather than loaded: the form only shows how many shipments exist.
  // A returned parcel is dead history, so it is not counted as a shipment.
  _count: { select: { fulfilments: { where: { status: { not: "RETURNED" } } } } },
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
    isRenewal: Boolean(quotation.renewsSubscriptionId),
    lineCount: quotation.lines.length,
    riskScore: quotation.riskScore,
    annualContractValue: totals.annualContractValue,
    grandTotal: totals.grandTotal,
    requestedDeliveryDate: quotation.requestedDeliveryDate,
    lastActivityAt: quotation.lastActivityAt,
    createdAt: quotation.createdAt,
  };
}

function lineView(line, figures, shortByProduct) {
  const onHand = onHandQty(line.product);
  const short = shortByProduct.get(line.productId);

  return {
    id: line.id,
    productId: line.productId,
    productName: line.product.name,
    description: line.product.description,
    variantId: line.variantId,
    variantLabel: variantLabel(line.variant),
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
    // The effective notice, not the raw column: a line saved before it had one
    // still renews, on the default for its plan.
    renewalLeadDays: line.plan
      ? line.renewalLeadDays ?? defaultRenewalLeadDays(line.plan)
      : null,
    // The cap depends on the plan's period, so it is worked out here rather
    // than repeating the period maths in the browser.
    renewalLeadDaysMax: line.plan ? maxRenewalLeadDays(line.plan) : null,
    isStockable: line.product.isStockable,
    onHand,
    isShort: Boolean(short),
    taxRatePct: figures.taxRatePct,
    net: figures.net,
    taxAmount: figures.taxAmount,
    total: figures.total,
    monthlyNet: figures.monthlyNet,
    isProrated: figures.isProrated,
  };
}

export function quotationDetail(
  quotation,
  { role, activityLogs = [], suggestions = [], routing = null, billing = null } = {},
) {
  const totals = quotationTotals(quotation.lines);
  const internal = isInternal(role);
  const short = shortStockLines(quotation.lines);
  const shortByProduct = new Map(short.map((row) => [row.productId, row]));

  const view = {
    id: quotation.id,
    number: quotation.number,
    status: quotation.status,
    isEditable: isEditable(quotation.status),
    canMessage: canMessage(quotation.status),
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
    lines: quotation.lines.map((line, index) =>
      lineView(line, totals.lineFigures[index], shortByProduct),
    ),
    // Set when this order renews a subscription rather than being new business.
    renewal: quotation.renewsSubscription
      ? {
          subscriptionId: quotation.renewsSubscription.id,
          reference: quotation.renewsSubscription.reference,
          periodStart: quotation.renewalPeriodStart,
        }
      : null,
    stockWarnings: short,
    // The customer's own words — what they asked for, and why they sent it
    // back. Both sides read the same thread.
    messages: (quotation.portalMessages || []).map((message) => {
      const line = (quotation.lines || []).find((row) => row.id === message.quotationLineId);

      return {
        id: message.id,
        text: message.text,
        by: message.author ? message.author.name : "Customer",
        fromCustomer: message.author ? message.author.role === ROLES.CUSTOMER : true,
        at: message.createdAt,
        lineId: message.quotationLineId || null,
        lineName: line ? line.product.name : null,
        counterDiscountPct: message.counterDiscountPct ?? null,
      };
    }),
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
    // Sent with the record so the form's related-record buttons need no extra
    // request of their own.
    view.counts = {
      shipments: quotation._count ? quotation._count.fulfilments : 0,
      approvals: (quotation.approvalSteps || []).length,
      invoices: billing ? billing.invoices : 0,
      subscriptions: billing ? billing.subscriptions : 0,
    };
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
