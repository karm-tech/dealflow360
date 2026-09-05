import { Field, Input, Select } from "../../components/ui";
import { ROLES } from "../../lib/constants";

export function filtersFromSearch(params) {
  return {
    period: params.get("period") || "all",
    from: params.get("from") || "",
    to: params.get("to") || "",
    repId: params.get("repId") || "",
    approval: params.get("approval") || "",
    categoryId: params.get("categoryId") || "",
    productId: params.get("productId") || "",
  };
}

export function filtersToParams(filters) {
  const params = {};
  for (const [key, value] of Object.entries(filters)) {
    if (!value || (key === "period" && value === "all")) continue;
    if ((key === "from" || key === "to") && filters.period !== "custom") continue;
    params[key] = value;
  }
  return params;
}

export function applyFiltersToSearch(filters, setParams) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(filtersToParams(filters))) {
    next.set(key, value);
  }
  setParams(next, { replace: true });
}

export function ReportFilters({ filters, options, role, onChange }) {
  const products = (options?.products || []).filter(
    (product) => !filters.categoryId || String(product.categoryId) === filters.categoryId,
  );

  function set(key, value) {
    const next = { ...filters, [key]: value };
    if (key === "period" && value !== "custom") {
      next.from = "";
      next.to = "";
    }
    if (key === "categoryId") next.productId = "";
    onChange(next);
  }

  return (
    <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-surface p-4">
      <Field label="Period" htmlFor="report-period" tooltip="Limits the report to quotations last touched in this window.">
        <Select
          id="report-period"
          value={filters.period}
          onChange={(event) => set("period", event.target.value)}
          className="!w-40"
        >
          <option value="all">All time</option>
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
          <option value="custom">Custom range</option>
        </Select>
      </Field>

      {filters.period === "custom" && (
        <>
          <Field label="From" htmlFor="report-from" tooltip="Inclusive start of the custom range.">
            <Input
              id="report-from"
              type="date"
              value={filters.from}
              onChange={(event) => set("from", event.target.value)}
              className="!w-40"
            />
          </Field>
          <Field label="To" htmlFor="report-to" tooltip="Inclusive end of the custom range.">
            <Input
              id="report-to"
              type="date"
              value={filters.to}
              onChange={(event) => set("to", event.target.value)}
              className="!w-40"
            />
          </Field>
        </>
      )}

      {role !== ROLES.SALES_REP && (
        <Field label="Rep" htmlFor="report-rep" tooltip="A rep only ever sees their own book. This filter is for managers and finance.">
          <Select
            id="report-rep"
            value={filters.repId}
            onChange={(event) => set("repId", event.target.value)}
            className="!w-44"
          >
            <option value="">All reps</option>
            {(options?.reps || []).map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Approval" htmlFor="report-approval" tooltip="Whether the quotation still needs a sign-off, already has one, or was sent back.">
        <Select
          id="report-approval"
          value={filters.approval}
          onChange={(event) => set("approval", event.target.value)}
          className="!w-40"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
      </Field>

      <Field label="Category" htmlFor="report-category" tooltip="Quotations that include at least one line in this category.">
        <Select
          id="report-category"
          value={filters.categoryId}
          onChange={(event) => set("categoryId", event.target.value)}
          className="!w-44"
        >
          <option value="">All categories</option>
          {(options?.categories || []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Product" htmlFor="report-product" tooltip="Quotations that include this product, including any of its variants.">
        <Select
          id="report-product"
          value={filters.productId}
          onChange={(event) => set("productId", event.target.value)}
          className="!w-52"
        >
          <option value="">All products</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
