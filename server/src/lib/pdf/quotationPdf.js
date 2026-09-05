// The quotation as the customer receives it.
//
// Built from the same figures the screen shows, so the paper and the app can
// never disagree. Nothing internal appears: no cost, no margin, no discount
// ceiling and no approval chain.

import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { QUOTATION_STATUS } from "../constants.js";
import { quotationTotals } from "../pricing.js";
import {
  CompanyHeader,
  Footer,
  Panel,
  Watermark,
  h,
  logoBuffer,
  money,
  shortDate,
  styles,
} from "./common.js";

// Only states worth stamping. An approved quotation is a normal one, so it
// carries no mark.
const WATERMARKS = {
  [QUOTATION_STATUS.DRAFT]: "DRAFT",
  [QUOTATION_STATUS.PENDING_APPROVAL]: "DRAFT",
  [QUOTATION_STATUS.CANCELLED]: "CANCELLED",
  [QUOTATION_STATUS.REJECTED]: "DECLINED",
  [QUOTATION_STATUS.CONFIRMED]: "CONFIRMED",
};

const COLUMNS = [
  { key: "item", label: "ITEM", width: "38%" },
  { key: "qty", label: "QTY", width: "9%", right: true },
  { key: "price", label: "UNIT PRICE", width: "15%", right: true },
  { key: "discount", label: "DISC.", width: "9%", right: true },
  { key: "tax", label: "TAX", width: "9%", right: true },
  { key: "total", label: "AMOUNT", width: "20%", right: true },
];

function LineRows({ lines, figures, currency }) {
  return lines.map((line, index) =>
    h(
      View,
      { key: line.id, style: styles.tableRow, wrap: false },
      h(
        View,
        { style: { width: COLUMNS[0].width } },
        h(Text, { style: styles.td }, line.product.name),
        line.variant
          ? h(Text, { style: styles.tdMuted }, `${line.variant.attribute}: ${line.variant.value}`)
          : null,
        line.product.description
          ? h(Text, { style: styles.tdMuted }, line.product.description)
          : null,
        h(
          Text,
          { style: styles.tdMuted },
          [
            line.product.sku,
            // A recurring line is priced per period, so the period has to be on
            // the paper or the amount looks wrong.
            figures[index].isRecurring && line.plan ? `billed ${line.plan.name.toLowerCase()}` : null,
            figures[index].isProrated ? "first period part-charged" : null,
          ]
            .filter(Boolean)
            .join("  ·  "),
        ),
      ),
      h(Text, { style: [styles.td, styles.right, { width: COLUMNS[1].width }] }, String(line.qty)),
      h(
        Text,
        { style: [styles.td, styles.right, { width: COLUMNS[2].width }] },
        money(line.unitPrice, currency),
      ),
      h(
        Text,
        { style: [styles.td, styles.right, { width: COLUMNS[3].width }] },
        line.discountPct > 0 ? `${line.discountPct}%` : "—",
      ),
      h(
        Text,
        { style: [styles.td, styles.right, { width: COLUMNS[4].width }] },
        `${figures[index].taxRatePct}%`,
      ),
      h(
        Text,
        { style: [styles.td, styles.right, { width: COLUMNS[5].width }] },
        money(figures[index].firstInvoiceNet, currency),
      ),
    ),
  );
}

function QuotationDocument({ quotation, company, currency }) {
  const totals = quotationTotals(quotation.lines);
  const logo = logoBuffer(company);
  const hasRecurring = totals.recurringMonthlyNet > 0;

  return h(
    Document,
    {
      title: `Quotation ${quotation.number}`,
      author: company.companyName,
      subject: `Quotation for ${quotation.customer.name}`,
    },
    h(
      Page,
      { size: "A4", style: styles.page },
      h(Watermark, { text: WATERMARKS[quotation.status] || null }),

      h(CompanyHeader, {
        company,
        logo,
        title: "QUOTATION",
        number: quotation.number,
        meta: [
          `Date: ${shortDate(quotation.inquiryDate || quotation.createdAt)}`,
          quotation.requestedDeliveryDate
            ? `Requested delivery: ${shortDate(quotation.requestedDeliveryDate)}`
            : null,
        ],
      }),

      h(View, { style: styles.rule }),

      h(
        View,
        { style: styles.panels },
        h(Panel, {
          label: "PREPARED FOR",
          name: quotation.customer.name,
          lines: [
            quotation.customer.email,
            quotation.customer.phone,
            [quotation.customer.city, quotation.customer.state].filter(Boolean).join(", "),
          ],
        }),
        h(Panel, {
          label: "YOUR CONTACT",
          name: quotation.rep?.name || company.companyName,
          lines: [quotation.rep?.email || company.companyEmail, company.companyPhone],
        }),
      ),

      h(View, { style: { height: 18 } }),

      h(
        View,
        { style: styles.tableHead },
        ...COLUMNS.map((column) =>
          h(
            Text,
            {
              key: column.key,
              style: [styles.th, column.right ? styles.right : null, { width: column.width }],
            },
            column.label,
          ),
        ),
      ),

      h(LineRows, { lines: quotation.lines, figures: totals.lineFigures, currency }),

      h(
        View,
        { style: styles.totals },
        h(
          View,
          { style: styles.totalsBox },
          totals.oneTimeNet > 0 &&
            h(
              View,
              { style: styles.totalsRow },
              h(Text, { style: styles.totalsLabel }, "One-time charges"),
              h(Text, { style: styles.totalsValue }, money(totals.oneTimeNet, currency)),
            ),
          hasRecurring &&
            h(
              View,
              { style: styles.totalsRow },
              h(Text, { style: styles.totalsLabel }, "Recurring, per month"),
              h(Text, { style: styles.totalsValue }, money(totals.recurringMonthlyNet, currency)),
            ),
          h(
            View,
            { style: styles.totalsRow },
            h(Text, { style: styles.totalsLabel }, "Subtotal, this invoice"),
            h(Text, { style: styles.totalsValue }, money(totals.firstInvoiceNet, currency)),
          ),
          h(
            View,
            { style: styles.totalsRow },
            h(Text, { style: styles.totalsLabel }, "Tax"),
            h(Text, { style: styles.totalsValue }, money(totals.taxAmount, currency)),
          ),
          h(
            View,
            { style: styles.grandRow },
            h(Text, { style: styles.grandLabel }, "Payable now"),
            h(Text, { style: styles.grandValue }, money(totals.grandTotal, currency)),
          ),
          // A mixed order has no single total, so the annual value is stated
          // rather than letting "payable now" stand in for the whole contract.
          hasRecurring &&
            h(
              View,
              { style: [styles.totalsRow, { marginTop: 5 }] },
              h(Text, { style: styles.totalsLabel }, "Annual contract value"),
              h(Text, { style: styles.totalsValue }, money(totals.annualContractValue, currency)),
            ),
        ),
      ),

      hasRecurring &&
        h(
          Text,
          { style: styles.note },
          "This order mixes one-time and recurring items. The amount payable now covers the one-time lines in full and the recurring lines for the remainder of their first period; recurring items are invoiced again each period thereafter.",
        ),

      quotation.notes && h(Text, { style: styles.note }, quotation.notes),

      h(Footer, { company }),
    ),
  );
}

export function quotationPdf(quotation, company, currency = "INR") {
  return renderToBuffer(h(QuotationDocument, { quotation, company, currency }));
}

export function quotationPdfName(quotation) {
  return `Quotation-${quotation.number}.pdf`;
}
