// SpreadsheetML 2003. Excel opens it as a real workbook without a library.

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cell(value) {
  if (value === null || value === undefined || value === "") {
    return `<Cell><Data ss:Type="String"></Data></Cell>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function sheet(name, columns, rows) {
  const header = `<Row>${columns.map((column) => cell(column.label)).join("")}</Row>`;
  const body = rows
    .map((row) => `<Row>${columns.map((column) => cell(column.value(row))).join("")}</Row>`)
    .join("");

  return `<Worksheet ss:Name="${escapeXml(name)}"><Table>${header}${body}</Table></Worksheet>`;
}

export function toXls(worksheets) {
  const books = worksheets.map((entry) => sheet(entry.name, entry.columns, entry.rows)).join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${books}
</Workbook>`;
}
