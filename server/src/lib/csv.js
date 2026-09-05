// CSV as text, built here rather than with a library because the whole format
// is one quoting rule.

// A field is quoted whenever it contains something that would otherwise break
// the row, and an embedded quote is doubled. A leading = + - @ is prefixed with
// a quote as well: spreadsheets read those as the start of a formula, so an
// exported customer name is not treated as something to execute.
function field(value) {
  if (value === null || value === undefined) return "";

  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns, rows) {
  const header = columns.map((column) => field(column.label)).join(",");

  const body = rows.map((row) =>
    columns.map((column) => field(column.value(row))).join(","),
  );

  // A BOM so Excel opens the file as UTF-8 rather than mangling any name in it,
  // and CRLF because that is what the format actually specifies.
  return `\ufeff${[header, ...body].join("\r\n")}\r\n`;
}
