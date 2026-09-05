// Where a quotation was opened from decides the breadcrumb and which list the
// pager walks. Each entry points at a neighbours endpoint that reuses the query
// its own list uses, so the two cannot drift apart.
const SCOPES = {
  approvals: {
    label: "Approvals",
    listTo: "/approvals",
    neighboursPath: (id) => `/approvals/${id}/neighbours`,
  },
};

const QUOTATIONS = {
  label: "Quotations",
  listTo: "/quotations",
  neighboursPath: (id) => `/quotations/${id}/neighbours`,
};

export function quotationScope(name) {
  return SCOPES[name] || QUOTATIONS;
}
