// PDF, CSV and XLS. Access matches the record itself, so a guessed URL is refused.

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { INTERNAL_ROLES, INVOICE_STATUS, ROLES } from "../lib/constants.js";
import { QUOTATION_INCLUDE } from "../lib/quotationView.js";
import { quotationTotals } from "../lib/pricing.js";
import { quotationPdf, quotationPdfName } from "../lib/pdf/quotationPdf.js";
import { invoicePdf, invoicePdfName } from "../lib/pdf/invoicePdf.js";
import { companySettings } from "../lib/company.js";
import { toCsv } from "../lib/csv.js";
import { toXls } from "../lib/xls.js";
import { buildSalesReport } from "../lib/reports.js";
import { reportPdf, reportPdfName } from "../lib/pdf/reportPdf.js";

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

function sendPdf(res, buffer, filename) {
  res.setHeader("Content-Type", "application/pdf");
  // inline, so a click opens it in the browser's viewer rather than dropping a
  // file the user then has to go and find.
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.send(buffer);
}

function sendCsv(res, text, filename) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(text);
}

// --- quotation PDF ----------------------------------------------------------

async function loadQuotationForPdf(db, id) {
  return db.quotation.findUnique({ where: { id }, include: QUOTATION_INCLUDE });
}

documentsRouter.get("/quotations/:id.pdf", async (req, res) => {
  const quotation = await loadQuotationForPdf(req.db, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  if (req.user.role === ROLES.CUSTOMER && quotation.customerId !== req.user.customerId) {
    return res.status(403).json({ error: "That quotation belongs to another customer" });
  }

  const { company, currency } = await companySettings(req.db);
  const buffer = await quotationPdf(quotation, company, currency);

  sendPdf(res, buffer, quotationPdfName(quotation));
});

// --- invoice PDF ------------------------------------------------------------

const INVOICE_PDF_INCLUDE = {
  customer: true,
  quotation: { select: { number: true, confirmedAt: true, customerId: true } },
  lines: { orderBy: { id: "asc" } },
  payments: { orderBy: { paidAt: "asc" } },
  creditNotes: true,
};

documentsRouter.get("/invoices/:id.pdf", async (req, res) => {
  const invoice = await req.db.invoice.findUnique({
    where: { id: Number(req.params.id) },
    include: INVOICE_PDF_INCLUDE,
  });

  if (!invoice) return res.status(404).json({ error: "That invoice no longer exists" });

  if (req.user.role === ROLES.CUSTOMER && invoice.customerId !== req.user.customerId) {
    return res.status(403).json({ error: "That invoice belongs to another customer" });
  }

  // A draft invoice has not been issued, so there is nothing to hand to a
  // customer yet. Staff can still see it.
  if (req.user.role === ROLES.CUSTOMER && invoice.status === INVOICE_STATUS.DRAFT) {
    return res.status(403).json({ error: "That invoice has not been issued yet" });
  }

  const { company, currency } = await companySettings(req.db);
  const buffer = await invoicePdf(invoice, company, currency);

  sendPdf(res, buffer, invoicePdfName(invoice));
});

// --- CSV exports ------------------------------------------------------------

const exportsRouter = Router();
exportsRouter.use(requireRole(...INTERNAL_ROLES));
documentsRouter.use("/exports", exportsRouter);

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

// The export answers the same question the screen was asking, so the filters
// are read from the query string exactly as the list route reads them. An export
// that quietly returned everything would not match what the user was looking at.
exportsRouter.get("/quotations.csv", async (req, res) => {
  const { status, search } = req.query;

  const where = {
    ...(req.user.role === ROLES.SALES_REP ? { repId: req.user.id } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { number: { contains: String(search) } },
            { customer: { name: { contains: String(search) } } },
          ],
        }
      : {}),
  };

  const quotations = await req.db.quotation.findMany({
    where,
    include: {
      customer: { include: { tier: true } },
      rep: { select: { name: true } },
      lines: { include: { product: { include: { category: true } }, plan: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = quotations.map((quotation) => ({
    quotation,
    totals: quotationTotals(quotation.lines),
  }));

  const columns = [
    { label: "Number", value: (row) => row.quotation.number },
    { label: "Status", value: (row) => row.quotation.status },
    { label: "Customer", value: (row) => row.quotation.customer.name },
    { label: "Tier", value: (row) => row.quotation.customer.tier.name },
    { label: "Owner", value: (row) => row.quotation.rep?.name || "" },
    { label: "Lines", value: (row) => row.quotation.lines.length },
    { label: "One-time", value: (row) => row.totals.oneTimeNet },
    { label: "Recurring per month", value: (row) => row.totals.recurringMonthlyNet },
    { label: "Payable now", value: (row) => row.totals.grandTotal },
    { label: "Annual contract value", value: (row) => row.totals.annualContractValue },
    { label: "Risk score", value: (row) => row.quotation.riskScore },
    { label: "Created", value: (row) => row.quotation.createdAt.toISOString().slice(0, 10) },
    {
      label: "Last activity",
      value: (row) => row.quotation.lastActivityAt.toISOString().slice(0, 10),
    },
  ];

  // Margin is internal, so it is added for the roles that already see it on the
  // screen and left off everyone else's file.
  if ([ROLES.ADMIN, ROLES.FINANCE, ROLES.SALES_MANAGER].includes(req.user.role)) {
    columns.push({ label: "Margin %", value: (row) => row.totals.marginPct });
  }

  sendCsv(res, toCsv(columns, rows), `quotations-${stamp()}.csv`);
});

exportsRouter.get("/invoices.csv", requireRole(ROLES.ADMIN, ROLES.FINANCE), async (req, res) => {
  const { status } = req.query;

  const invoices = await req.db.invoice.findMany({
    where: status ? { status: String(status) } : {},
    include: {
      customer: { select: { name: true } },
      quotation: { select: { number: true } },
      payments: { select: { amount: true } },
      creditNotes: { select: { amount: true } },
    },
    orderBy: { issueDate: "desc" },
  });

  const columns = [
    { label: "Number", value: (invoice) => invoice.number },
    { label: "Status", value: (invoice) => invoice.status },
    { label: "Type", value: (invoice) => invoice.type },
    { label: "Customer", value: (invoice) => invoice.customer.name },
    { label: "Order", value: (invoice) => invoice.quotation.number },
    { label: "Issued", value: (invoice) => invoice.issueDate.toISOString().slice(0, 10) },
    {
      label: "Due",
      value: (invoice) => (invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : ""),
    },
    { label: "Subtotal", value: (invoice) => invoice.subtotal },
    { label: "Tax", value: (invoice) => invoice.taxAmount },
    { label: "Total", value: (invoice) => invoice.total },
    {
      label: "Paid",
      value: (invoice) => invoice.payments.reduce((sum, payment) => sum + payment.amount, 0),
    },
    {
      label: "Credited",
      value: (invoice) => invoice.creditNotes.reduce((sum, note) => sum + note.amount, 0),
    },
    {
      label: "Outstanding",
      value: (invoice) =>
        Math.max(
          0,
          invoice.total -
            invoice.payments.reduce((sum, payment) => sum + payment.amount, 0) -
            invoice.creditNotes.reduce((sum, note) => sum + note.amount, 0),
        ),
    },
  ];

  sendCsv(res, toCsv(columns, invoices), `invoices-${stamp()}.csv`);
});

exportsRouter.get("/products.csv", async (req, res) => {
  const { q, kind } = req.query;

  const products = await req.db.product.findMany({
    where: {
      ...(q
        ? { OR: [{ name: { contains: String(q) } }, { sku: { contains: String(q) } }] }
        : {}),
      // Goods and services are told apart by whether stock is tracked, the same
      // way the screen splits them.
      ...(kind === "goods" ? { isStockable: true } : {}),
      ...(kind === "service" ? { isStockable: false } : {}),
    },
    include: { category: true, stocks: true, defaultPlan: true },
    orderBy: { name: "asc" },
  });

  const seesCost = [ROLES.ADMIN, ROLES.FINANCE, ROLES.SALES_MANAGER].includes(req.user.role);

  const columns = [
    { label: "SKU", value: (product) => product.sku },
    { label: "Name", value: (product) => product.name },
    { label: "Description", value: (product) => product.description || "" },
    { label: "Category", value: (product) => product.category.name },
    { label: "Unit", value: (product) => product.unit },
    { label: "Sales price", value: (product) => product.salesPrice },
    { label: "Tax %", value: (product) => product.taxRatePct },
    { label: "Stockable", value: (product) => (product.isStockable ? "Yes" : "No") },
    { label: "Billing", value: (product) => product.defaultBillingType },
    { label: "Default plan", value: (product) => product.defaultPlan?.name || "" },
    {
      label: "On hand",
      value: (product) => product.stocks.reduce((sum, row) => sum + row.qty, 0),
    },
    { label: "Active", value: (product) => (product.isActive ? "Yes" : "No") },
  ];

  if (seesCost) {
    columns.splice(5, 0, { label: "Cost", value: (product) => product.cost });
  }

  sendCsv(res, toCsv(columns, products), `products-${stamp()}.csv`);
});

exportsRouter.get("/reports.pdf", async (req, res) => {
  const report = await buildSalesReport(req.db, req.query, req.user);
  const { company, currency } = await companySettings(req.db);
  const buffer = await reportPdf(report, company, currency);
  sendPdf(res, buffer, reportPdfName());
});

exportsRouter.get("/reports.xls", async (req, res) => {
  const report = await buildSalesReport(req.db, req.query, req.user);
  const seesMargin = [ROLES.ADMIN, ROLES.FINANCE, ROLES.SALES_MANAGER].includes(req.user.role);

  const quoteColumns = [
    { label: "Number", value: (row) => row.number },
    { label: "Status", value: (row) => row.status },
    { label: "Customer", value: (row) => row.customer },
    { label: "Tier", value: (row) => row.tier },
    { label: "Owner", value: (row) => row.rep },
    { label: "Lines", value: (row) => row.lineCount },
    { label: "Payable now", value: (row) => row.grandTotal },
    { label: "Annual contract value", value: (row) => row.annualContractValue },
    { label: "Risk score", value: (row) => row.riskScore },
    { label: "Created", value: (row) => new Date(row.createdAt).toISOString().slice(0, 10) },
  ];
  if (seesMargin) {
    quoteColumns.push({ label: "Margin %", value: (row) => row.marginPct });
  }

  const xml = toXls([
    {
      name: "Summary",
      columns: [
        { label: "Metric", value: (row) => row.metric },
        { label: "Value", value: (row) => row.value },
      ],
      rows: [
        { metric: "Period", value: report.filters.periodLabel },
        { metric: "Quotations", value: report.kpis.quotations },
        { metric: "Annual contract value", value: report.kpis.annualContractValue },
        { metric: "Payable now", value: report.kpis.payableNow },
        { metric: "Won", value: report.kpis.won },
        { metric: "Lost", value: report.kpis.lost },
        { metric: "Win rate %", value: report.kpis.winRatePct ?? "" },
        { metric: "Pending approval", value: report.approval.pending },
        { metric: "Approved", value: report.approval.approved },
        { metric: "Rejected", value: report.approval.rejected },
      ],
    },
    { name: "Quotations", columns: quoteColumns, rows: report.quotations },
    {
      name: "Products",
      columns: [
        { label: "SKU", value: (row) => row.sku },
        { label: "Product", value: (row) => row.name },
        { label: "Category", value: (row) => row.category },
        { label: "Qty", value: (row) => row.qty },
        { label: "Quotes", value: (row) => row.quotes },
        { label: "Annual value", value: (row) => row.annualNet },
        { label: "Discount given", value: (row) => row.discountGiven },
      ],
      rows: report.products,
    },
  ]);

  res.setHeader("Content-Type", "application/vnd.ms-excel");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="sales-report-${stamp()}.xls"`,
  );
  res.send(xml);
});

exportsRouter.get("/customers.csv", async (req, res) => {
  const customers = await req.db.customer.findMany({
    include: {
      tier: true,
      _count: { select: { quotations: true, invoices: true, subscriptions: true } },
    },
    orderBy: { name: "asc" },
  });

  const columns = [
    { label: "Name", value: (customer) => customer.name },
    { label: "Email", value: (customer) => customer.email },
    { label: "Phone", value: (customer) => customer.phone || "" },
    { label: "City", value: (customer) => customer.city || "" },
    { label: "State", value: (customer) => customer.state || "" },
    { label: "Tier", value: (customer) => customer.tier.name },
    { label: "Discount ceiling %", value: (customer) => customer.tier.maxDiscountPct },
    { label: "Quotations", value: (customer) => customer._count.quotations },
    { label: "Invoices", value: (customer) => customer._count.invoices },
    { label: "Subscriptions", value: (customer) => customer._count.subscriptions },
    { label: "Active", value: (customer) => (customer.isActive ? "Yes" : "No") },
    { label: "Added", value: (customer) => customer.createdAt.toISOString().slice(0, 10) },
  ];

  sendCsv(res, toCsv(columns, customers), `customers-${stamp()}.csv`);
});
