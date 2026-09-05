// The invoice as the customer receives it.
//
// The watermark is worked out from the invoice's own figures rather than passed
// in, so a document cannot be printed stamped PAID while money is still owed.

import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { INVOICE_STATUS, INVOICE_TYPE } from "../constants.js";
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

const COLUMNS = [
  { key: "item", label: "DESCRIPTION", width: "44%" },
  { key: "qty", label: "QTY", width: "9%", right: true },
  { key: "price", label: "UNIT PRICE", width: "16%", right: true },
  { key: "tax", label: "TAX", width: "9%", right: true },
  { key: "total", label: "AMOUNT", width: "22%", right: true },
];

function settlement(invoice) {
  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const credited = invoice.creditNotes.reduce((sum, note) => sum + note.amount, 0);
  const owed = Math.max(0, invoice.total - paid - credited);

  return { paid, credited, owed };
}

// Derived from the money and the date, in that order: cancelled beats
// everything, then settled, then late.
function watermarkFor(invoice, owed, now = new Date()) {
  if (invoice.status === INVOICE_STATUS.CANCELLED) return "CANCELLED";
  if (invoice.status === INVOICE_STATUS.DRAFT) return "DRAFT";
  if (owed <= 0) return "PAID";
  if (invoice.dueDate && new Date(invoice.dueDate) < now) return "OVERDUE";
  return null;
}

function InvoiceDocument({ invoice, company, currency }) {
  const logo = logoBuffer(company);
  const { paid, credited, owed } = settlement(invoice);
  const isOverdue = owed > 0 && invoice.dueDate && new Date(invoice.dueDate) < new Date();

  return h(
    Document,
    {
      title: `Invoice ${invoice.number}`,
      author: company.companyName,
      subject: `Invoice for ${invoice.customer.name}`,
    },
    h(
      Page,
      { size: "A4", style: styles.page },
      h(Watermark, { text: watermarkFor(invoice, owed) }),

      h(CompanyHeader, {
        company,
        logo,
        title: "INVOICE",
        number: invoice.number,
        meta: [
          `Issued: ${shortDate(invoice.issueDate)}`,
          invoice.dueDate ? `Due: ${shortDate(invoice.dueDate)}` : null,
          invoice.type === INVOICE_TYPE.RECURRING ? "For a recurring period" : null,
        ],
      }),

      h(View, { style: styles.rule }),

      h(
        View,
        { style: styles.panels },
        h(Panel, {
          label: "BILLED TO",
          name: invoice.customer.name,
          lines: [
            invoice.customer.email,
            invoice.customer.phone,
            [invoice.customer.city, invoice.customer.state].filter(Boolean).join(", "),
          ],
        }),
        h(Panel, {
          label: "AGAINST ORDER",
          name: invoice.quotation.number,
          lines: [
            invoice.quotation.confirmedAt
              ? `Confirmed ${shortDate(invoice.quotation.confirmedAt)}`
              : null,
            company.companyGstin ? `Our GSTIN ${company.companyGstin}` : null,
          ],
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

      ...invoice.lines.map((line) =>
        h(
          View,
          { key: line.id, style: styles.tableRow, wrap: false },
          h(
            View,
            { style: { width: COLUMNS[0].width } },
            h(Text, { style: styles.td }, line.description),
            line.discountPct > 0 &&
              h(Text, { style: styles.tdMuted }, `${line.discountPct}% discount applied`),
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
            `${line.taxRatePct}%`,
          ),
          h(
            Text,
            { style: [styles.td, styles.right, { width: COLUMNS[4].width }] },
            money(line.lineTotal, currency),
          ),
        ),
      ),

      h(
        View,
        { style: styles.totals },
        h(
          View,
          { style: styles.totalsBox },
          h(
            View,
            { style: styles.totalsRow },
            h(Text, { style: styles.totalsLabel }, "Subtotal"),
            h(Text, { style: styles.totalsValue }, money(invoice.subtotal, currency)),
          ),
          h(
            View,
            { style: styles.totalsRow },
            h(Text, { style: styles.totalsLabel }, "Tax"),
            h(Text, { style: styles.totalsValue }, money(invoice.taxAmount, currency)),
          ),
          h(
            View,
            { style: styles.grandRow },
            h(Text, { style: styles.grandLabel }, "Invoice total"),
            h(Text, { style: styles.grandValue }, money(invoice.total, currency)),
          ),
          paid > 0 &&
            h(
              View,
              { style: [styles.totalsRow, { marginTop: 5 }] },
              h(Text, { style: styles.totalsLabel }, "Paid"),
              h(Text, { style: styles.totalsValue }, `- ${money(paid, currency)}`),
            ),
          // A credit note is shown as its own line rather than folded into the
          // total, so the original amount stays on the document.
          credited > 0 &&
            h(
              View,
              { style: styles.totalsRow },
              h(Text, { style: styles.totalsLabel }, "Credited"),
              h(Text, { style: styles.totalsValue }, `- ${money(credited, currency)}`),
            ),
          (paid > 0 || credited > 0) &&
            h(
              View,
              { style: styles.grandRow },
              h(Text, { style: styles.grandLabel }, owed > 0 ? "Still due" : "Settled in full"),
              h(Text, { style: styles.grandValue }, money(owed, currency)),
            ),
        ),
      ),

      isOverdue &&
        h(
          Text,
          { style: [styles.note, { color: "#b42318" }] },
          `This invoice fell due on ${shortDate(invoice.dueDate)} and ${money(owed, currency)} remains outstanding.`,
        ),

      invoice.payments.length > 0 &&
        h(
          View,
          { style: { marginTop: 16 } },
          h(Text, { style: styles.sectionTitle }, "PAYMENTS RECEIVED"),
          ...invoice.payments.map((payment) =>
            h(
              View,
              { key: payment.id, style: styles.totalsRow },
              h(
                Text,
                { style: styles.totalsLabel },
                `${shortDate(payment.paidAt)} · ${payment.method}${payment.reference ? ` · ${payment.reference}` : ""}`,
              ),
              h(Text, { style: styles.totalsValue }, money(payment.amount, currency)),
            ),
          ),
        ),

      h(Footer, { company }),
    ),
  );
}

export function invoicePdf(invoice, company, currency = "INR") {
  return renderToBuffer(h(InvoiceDocument, { invoice, company, currency }));
}

export function invoicePdfName(invoice) {
  return `Invoice-${invoice.number}.pdf`;
}
