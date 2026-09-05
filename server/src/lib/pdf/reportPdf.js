import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { CompanyHeader, Footer, h, logoBuffer, money, shortDate, styles } from "./common.js";

const QUOTE_COLS = [
  { key: "number", label: "NUMBER", width: "16%" },
  { key: "customer", label: "CUSTOMER", width: "22%" },
  { key: "status", label: "STATUS", width: "18%" },
  { key: "rep", label: "REP", width: "16%" },
  { key: "acv", label: "ANNUAL VALUE", width: "16%", right: true },
  { key: "date", label: "CREATED", width: "12%", right: true },
];

const PRODUCT_COLS = [
  { key: "name", label: "PRODUCT", width: "34%" },
  { key: "category", label: "CATEGORY", width: "18%" },
  { key: "qty", label: "QTY", width: "10%", right: true },
  { key: "quotes", label: "QUOTES", width: "12%", right: true },
  { key: "acv", label: "ANNUAL VALUE", width: "14%", right: true },
  { key: "disc", label: "DISCOUNT GIVEN", width: "12%", right: true },
];

function Kpi({ label, value }) {
  return h(
    View,
    { style: { flex: 1, backgroundColor: "#f7f5f1", padding: 8, borderRadius: 3 } },
    h(Text, { style: styles.panelLabel }, label),
    h(Text, { style: { fontSize: 12, fontFamily: "Helvetica-Bold" } }, value),
  );
}

export function reportPdfName() {
  return `sales-report-${new Date().toISOString().slice(0, 10)}.pdf`;
}

export async function reportPdf(report, company, currency = "INR") {
  const logo = logoBuffer(company);

  return renderToBuffer(
    h(
      Document,
      { title: `Sales report · ${report.filters.periodLabel}` },
      h(
        Page,
        { size: "A4", style: styles.page },
        h(CompanyHeader, {
          company,
          logo,
          title: "SALES REPORT",
          number: report.filters.periodLabel,
          meta: [
            `Quotations ${report.kpis.quotations}`,
            report.kpis.winRatePct === null ? null : `Win rate ${report.kpis.winRatePct}%`,
          ],
        }),
        h(View, { style: styles.rule }),
        h(
          View,
          { style: { flexDirection: "row", gap: 8, marginBottom: 14 } },
          h(Kpi, { label: "QUOTATIONS", value: String(report.kpis.quotations) }),
          h(Kpi, { label: "ANNUAL VALUE", value: money(report.kpis.annualContractValue, currency) }),
          h(Kpi, { label: "PAYABLE NOW", value: money(report.kpis.payableNow, currency) }),
          h(Kpi, {
            label: "WIN RATE",
            value: report.kpis.winRatePct === null ? "—" : `${report.kpis.winRatePct}%`,
          }),
        ),
        h(Text, { style: styles.sectionTitle }, "QUOTATIONS"),
        h(
          View,
          { style: styles.tableHead },
          ...QUOTE_COLS.map((col) =>
            h(Text, { style: [styles.th, col.right && styles.right, { width: col.width }] }, col.label),
          ),
        ),
        ...report.quotations.slice(0, 40).map((row) =>
          h(
            View,
            { key: row.id, style: styles.tableRow, wrap: false },
            h(Text, { style: [styles.td, { width: QUOTE_COLS[0].width }] }, row.number),
            h(Text, { style: [styles.td, { width: QUOTE_COLS[1].width }] }, row.customer),
            h(Text, { style: [styles.td, { width: QUOTE_COLS[2].width }] }, row.status),
            h(Text, { style: [styles.td, { width: QUOTE_COLS[3].width }] }, row.rep || "—"),
            h(
              Text,
              { style: [styles.td, styles.right, { width: QUOTE_COLS[4].width }] },
              money(row.annualContractValue, currency),
            ),
            h(
              Text,
              { style: [styles.td, styles.right, { width: QUOTE_COLS[5].width }] },
              shortDate(row.createdAt),
            ),
          ),
        ),
        report.quotations.length > 40
          ? h(
              Text,
              { style: styles.note },
              `Showing the first 40 of ${report.quotations.length} quotations. The Excel export has the full set.`,
            )
          : null,
        h(Text, { style: [styles.sectionTitle, { marginTop: 16 }] }, "BY PRODUCT"),
        h(
          View,
          { style: styles.tableHead },
          ...PRODUCT_COLS.map((col) =>
            h(Text, { style: [styles.th, col.right && styles.right, { width: col.width }] }, col.label),
          ),
        ),
        ...report.products.slice(0, 25).map((row) =>
          h(
            View,
            { key: row.productId, style: styles.tableRow, wrap: false },
            h(Text, { style: [styles.td, { width: PRODUCT_COLS[0].width }] }, row.name),
            h(Text, { style: [styles.td, { width: PRODUCT_COLS[1].width }] }, row.category),
            h(Text, { style: [styles.td, styles.right, { width: PRODUCT_COLS[2].width }] }, String(row.qty)),
            h(Text, { style: [styles.td, styles.right, { width: PRODUCT_COLS[3].width }] }, String(row.quotes)),
            h(
              Text,
              { style: [styles.td, styles.right, { width: PRODUCT_COLS[4].width }] },
              money(row.annualNet, currency),
            ),
            h(
              Text,
              { style: [styles.td, styles.right, { width: PRODUCT_COLS[5].width }] },
              money(row.discountGiven, currency),
            ),
          ),
        ),
        h(Footer, { company }),
      ),
    ),
  );
}
