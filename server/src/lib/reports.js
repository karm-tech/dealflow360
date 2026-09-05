// Builds the filtered sales report. Every figure is worked from the same
// quotation set the filters selected, so the table, the charts and the export
// cannot disagree.

import { QUOTATION_STATUS, ROLES, USER_STATUS } from "./constants.js";
import { quotationTotals, round } from "./pricing.js";
import { parseReportQuery, quotationReportWhere, reportPeriodLabel } from "./reportFilters.js";

export async function reportFilterOptions(db, user) {
  const [categories, products, reps] = await Promise.all([
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, categoryId: true },
    }),
    user.role === ROLES.SALES_REP
      ? []
      : db.user.findMany({
          where: {
            role: { in: [ROLES.SALES_REP, ROLES.SALES_MANAGER] },
            status: USER_STATUS.ACTIVE,
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
  ]);

  return { categories, products, reps };
}

export async function buildSalesReport(db, query, user) {
  const filters = parseReportQuery(query, user);
  const where = quotationReportWhere(filters);

  const quotations = await db.quotation.findMany({
    where,
    include: {
      customer: { include: { tier: true } },
      rep: { select: { id: true, name: true } },
      lines: { include: { product: { include: { category: true } }, plan: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = quotations.map((quotation) => {
    const totals = quotationTotals(quotation.lines);
    return {
      id: quotation.id,
      number: quotation.number,
      status: quotation.status,
      customer: quotation.customer.name,
      tier: quotation.customer.tier.name,
      rep: quotation.rep ? quotation.rep.name : "",
      createdAt: quotation.createdAt,
      annualContractValue: totals.annualContractValue,
      grandTotal: totals.grandTotal,
      marginPct: totals.marginPct,
      riskScore: quotation.riskScore,
      lineCount: quotation.lines.length,
    };
  });

  const byProduct = new Map();
  for (const quotation of quotations) {
    const figures = quotationTotals(quotation.lines).lineFigures;
    quotation.lines.forEach((line, index) => {
      const key = line.productId;
      const current = byProduct.get(key) || {
        productId: line.productId,
        name: line.product.name,
        sku: line.product.sku,
        category: line.product.category.name,
        qty: 0,
        annualNet: 0,
        annualGross: 0,
        quotes: new Set(),
      };
      current.qty += line.qty;
      current.annualNet += figures[index].annualNet;
      current.annualGross += figures[index].annualGross;
      current.quotes.add(quotation.id);
      byProduct.set(key, current);
    });
  }

  const products = [...byProduct.values()]
    .map((row) => ({
      productId: row.productId,
      name: row.name,
      sku: row.sku,
      category: row.category,
      qty: row.qty,
      quotes: row.quotes.size,
      annualNet: round(row.annualNet),
      discountGiven: round(row.annualGross - row.annualNet),
    }))
    .sort((a, b) => b.annualNet - a.annualNet);

  const approval = { pending: 0, approved: 0, rejected: 0 };
  for (const row of rows) {
    if (row.status === QUOTATION_STATUS.PENDING_APPROVAL) approval.pending += 1;
    else if (row.status === QUOTATION_STATUS.APPROVED) approval.approved += 1;
    else if (row.status === QUOTATION_STATUS.REJECTED) approval.rejected += 1;
  }

  const won = rows.filter((row) => row.status === QUOTATION_STATUS.CONFIRMED).length;
  const lost = rows.filter(
    (row) => row.status === QUOTATION_STATUS.REJECTED || row.status === QUOTATION_STATUS.CANCELLED,
  ).length;

  return {
    filters: {
      period: filters.period,
      from: filters.from ? filters.from.toISOString().slice(0, 10) : "",
      to: filters.to ? filters.to.toISOString().slice(0, 10) : "",
      repId: filters.repId,
      approval: filters.approval,
      categoryId: filters.categoryId,
      productId: filters.productId,
      periodLabel: reportPeriodLabel(filters),
    },
    kpis: {
      quotations: rows.length,
      annualContractValue: round(rows.reduce((sum, row) => sum + row.annualContractValue, 0)),
      payableNow: round(rows.reduce((sum, row) => sum + row.grandTotal, 0)),
      won,
      lost,
      winRatePct: won + lost > 0 ? round((won / (won + lost)) * 100) : null,
    },
    approval,
    quotations: rows,
    products,
  };
}
