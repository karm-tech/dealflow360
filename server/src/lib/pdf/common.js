// Shared furniture for the printed documents: the styles, the company header,
// the footer and the status watermark.
//
// These files call createElement directly instead of using JSX, because the
// server runs as plain Node with no build step to compile JSX. It reads a
// little heavier than markup but behaves identically: h(View, style, children)
// is the same tree react-pdf would get from <View style=...>.

import { createElement } from "react";
import { StyleSheet, Text, View, Image } from "@react-pdf/renderer";
import fs from "node:fs";
import path from "node:path";
import { UPLOADS_DIR } from "../uploads.js";

export function h(component, props, ...children) {
  return createElement(component, props, ...children.flat().filter(Boolean));
}

// Ink and sand, matching the screens the document is printed from.
export const COLORS = {
  ink: "#1f2328",
  muted: "#6b7280",
  line: "#e5e0d8",
  band: "#f7f5f1",
  bad: "#b42318",
  good: "#067647",
};

export const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 64,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: COLORS.ink,
  },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 108, maxHeight: 44, objectFit: "contain", marginBottom: 6 },
  companyName: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  companyLine: { fontSize: 8, color: COLORS.muted, marginTop: 1.5 },

  docTitle: { fontSize: 19, fontFamily: "Helvetica-Bold", textAlign: "right" },
  docNumber: { fontSize: 10, textAlign: "right", marginTop: 2 },
  docMeta: { fontSize: 8, color: COLORS.muted, textAlign: "right", marginTop: 1.5 },

  rule: { borderBottomWidth: 1, borderBottomColor: COLORS.line, marginVertical: 12 },

  panels: { flexDirection: "row", gap: 16 },
  panel: { flex: 1, backgroundColor: COLORS.band, padding: 10, borderRadius: 3 },
  panelLabel: {
    fontSize: 7,
    color: COLORS.muted,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  panelName: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  panelLine: { fontSize: 8, color: COLORS.muted, marginTop: 1.5 },

  sectionTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginBottom: 6 },

  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.ink,
    paddingBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.line,
    paddingVertical: 5,
  },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: COLORS.muted, letterSpacing: 0.4 },
  td: { fontSize: 8.5 },
  tdMuted: { fontSize: 7.5, color: COLORS.muted, marginTop: 1 },

  right: { textAlign: "right" },

  totals: { marginTop: 14, flexDirection: "row", justifyContent: "flex-end" },
  totalsBox: { width: 220 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  totalsLabel: { fontSize: 8.5, color: COLORS.muted },
  totalsValue: { fontSize: 8.5 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.ink,
    marginTop: 5,
    paddingTop: 5,
  },
  grandLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  grandValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },

  note: { marginTop: 16, fontSize: 8, color: COLORS.muted, lineHeight: 1.5 },

  footer: {
    position: "absolute",
    bottom: 26,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.line,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7, color: COLORS.muted, maxWidth: 430, lineHeight: 1.4 },
  pageNumber: { fontSize: 7, color: COLORS.muted },

  watermark: {
    position: "absolute",
    top: 300,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 84,
    fontFamily: "Helvetica-Bold",
    // Rotated and barely inked so it reads as a stamp across the page without
    // making the figures underneath it hard to read.
    transform: "rotate(-28deg)",
    opacity: 0.09,
    letterSpacing: 6,
  },
});

// Helvetica has no rupee glyph, so the three-letter code is used instead of the
// symbol. A blank box where the currency should be looks like a broken document.
export function money(amount, currency = "INR") {
  const value = Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${value}`;
}

export function shortDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Read once per document. A logo row that has been deleted off disk must not
// take the whole document down with it.
export function logoBuffer(company) {
  if (!company.logoPath) return null;

  try {
    const file = path.join(UPLOADS_DIR, path.basename(company.logoPath));
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

export function CompanyHeader({ company, logo, title, number, meta }) {
  return h(
    View,
    { style: styles.headerRow },
    h(
      View,
      { style: { maxWidth: 250 } },
      logo && h(Image, { style: styles.logo, src: logo }),
      h(Text, { style: styles.companyName }, company.companyName),
      company.companyAddress && h(Text, { style: styles.companyLine }, company.companyAddress),
      company.companyGstin && h(Text, { style: styles.companyLine }, `GSTIN ${company.companyGstin}`),
      [company.companyPhone, company.companyEmail].filter(Boolean).length > 0 &&
        h(
          Text,
          { style: styles.companyLine },
          [company.companyPhone, company.companyEmail].filter(Boolean).join("  ·  "),
        ),
      company.companyWebsite && h(Text, { style: styles.companyLine }, company.companyWebsite),
    ),
    h(
      View,
      null,
      h(Text, { style: styles.docTitle }, title),
      h(Text, { style: styles.docNumber }, number),
      ...meta.filter(Boolean).map((line, index) => h(Text, { key: index, style: styles.docMeta }, line)),
    ),
  );
}

// The watermark is taken from the record's real status, never passed in as a
// label, so a document cannot be printed saying something the data does not.
export function Watermark({ text }) {
  if (!text) return null;
  return h(Text, { style: styles.watermark, fixed: true }, text);
}

export function Footer({ company }) {
  return h(
    View,
    { style: styles.footer, fixed: true },
    h(
      Text,
      { style: styles.footerText },
      company.documentFooter || `${company.companyName} · This document was generated electronically.`,
    ),
    h(Text, {
      style: styles.pageNumber,
      render: ({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`,
    }),
  );
}

export function Panel({ label, name, lines }) {
  return h(
    View,
    { style: styles.panel },
    h(Text, { style: styles.panelLabel }, label),
    h(Text, { style: styles.panelName }, name),
    ...lines.filter(Boolean).map((line, index) => h(Text, { key: index, style: styles.panelLine }, line)),
  );
}
