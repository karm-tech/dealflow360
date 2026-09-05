import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Select,
  Spinner,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_TONES,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONES,
} from "../../lib/constants";

// An order bills in two shapes at once, so they are listed separately rather
// than merged: an invoice is money owed now, a subscription is money owed
// repeatedly.
const VIEWS = [
  { key: "invoices", label: "Invoices" },
  { key: "subscriptions", label: "Subscriptions" },
];

export function BillingPage() {
  const navigate = useNavigate();

  // Filters live in the address bar so a link reproduces the same list and the
  // record pager can be handed the query the rows came from.
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "subscriptions" ? "subscriptions" : "invoices";
  const status = params.get("status") || "";
  const overdue = params.get("overdue") === "true";
  const quotationId = params.get("quotationId") || "";
  const customerId = params.get("customerId") || "";

  function setParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  // Status values differ between the two documents, so switching view drops a
  // filter that no longer applies.
  function setView(key) {
    const next = new URLSearchParams(params);
    next.set("view", key);
    next.delete("status");
    next.delete("overdue");
    setParams(next, { replace: true });
  }

  const listQuery = {
    status: status || undefined,
    overdue: overdue ? "true" : undefined,
    quotationId: quotationId || undefined,
    customerId: customerId || undefined,
  };

  const billing = useQuery({
    queryKey: ["billing-list", view, status, overdue, quotationId, customerId],
    queryFn: async () => {
      const { data } = await api.get(`/billing/${view}`, { params: listQuery });
      return view === "invoices" ? data.invoices : data.subscriptions;
    },
  });

  if (billing.isLoading) return <Spinner label="Loading billing" />;
  if (billing.isError) {
    return <ErrorState message={errorMessage(billing.error)} onRetry={billing.refetch} />;
  }

  const rows = billing.data;
  // Carried onto the record so its pager walks this list rather than all of it.
  const listParams = params.toString();

  // A list narrowed by something the user cannot see reads as missing records,
  // so the filter is named. The rows carry the name already.
  const scopedTo = quotationId
    ? rows[0]?.quotation?.number
    : customerId
      ? rows[0]?.customer?.name
      : null;

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Billing"
        subtitle="What has been invoiced, what is still owed, and what recurs."
      />

      <div className="mb-4 flex gap-1 border-b border-sand-200">
        {VIEWS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setView(tab.key)}
            className={
              tab.key === view
                ? "-mb-px border-b-2 border-ink-700 px-3 py-2 text-base font-medium text-ink-700"
                : "-mb-px border-b-2 border-transparent px-3 py-2 text-base font-medium text-sand-600 hover:text-sand-900"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(quotationId || customerId) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-100 bg-ink-50 px-3 py-2">
          <p className="text-sm text-ink-700">
            Showing billing for <span className="font-medium">{scopedTo || "one record"}</span>
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setParam(quotationId ? "quotationId" : "customerId", "")}
          >
            Clear
          </Button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Status" htmlFor="status">
          <Select
            id="status"
            value={status}
            onChange={(event) => setParam("status", event.target.value)}
            className="!w-48"
          >
            <option value="">All statuses</option>
            {Object.entries(
              view === "invoices" ? INVOICE_STATUS_LABELS : SUBSCRIPTION_STATUS_LABELS,
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        {view === "invoices" && (
          <label className="flex items-center gap-2 py-2 text-sm text-sand-700">
            <input
              type="checkbox"
              checked={overdue}
              onChange={(event) => setParam("overdue", event.target.checked ? "true" : "")}
              className="h-4 w-4 rounded border-sand-300 text-ink-700 focus:ring-ink-500/20"
            />
            Past its due date only
          </label>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={view === "invoices" ? "No invoices match" : "No subscriptions match"}
          hint="Billing is raised when an order is confirmed: one invoice now, and a subscription for every recurring line."
        />
      ) : view === "invoices" ? (
        <InvoiceRows
          rows={rows}
          onOpen={(id) => navigate(`/billing/invoices/${id}?${listParams}`)}
        />
      ) : (
        <SubscriptionRows
          rows={rows}
          onOpen={(id) => navigate(`/billing/subscriptions/${id}?${listParams}`)}
        />
      )}
    </div>
  );
}

function InvoiceRows({ rows, onOpen }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Invoice</TH>
          <TH>Order</TH>
          <TH>Customer</TH>
          <TH align="right">Total</TH>
          <TH align="right">Outstanding</TH>
          <TH>Status</TH>
          <TH align="right">Due</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id} onClick={() => onOpen(row.id)}>
            <TD className="font-medium text-ink-700">{row.number}</TD>
            <TD>{row.quotation ? row.quotation.number : "—"}</TD>
            <TD>{row.customer ? row.customer.name : "—"}</TD>
            <TD figure align="right">
              {formatMoney(row.total)}
            </TD>
            <TD figure align="right">
              {row.outstanding > 0 ? formatMoney(row.outstanding) : "—"}
            </TD>
            <TD>
              <div className="flex items-center gap-1.5">
                <StatusPill tone={INVOICE_STATUS_TONES[row.status]}>
                  {INVOICE_STATUS_LABELS[row.status]}
                </StatusPill>
                {row.isOverdue && <StatusPill tone="bad">Overdue</StatusPill>}
              </div>
            </TD>
            <TD align="right" className="whitespace-nowrap">
              <span className={`figure ${row.isOverdue ? "font-medium text-state-bad" : "text-sand-600"}`}>
                {formatDate(row.dueDate)}
              </span>
              {row.isOverdue && (
                <span className="ml-1 inline-flex text-state-bad" title="Past its due date">
                  <TriangleAlert size={12} />
                </span>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function SubscriptionRows({ rows, onOpen }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Subscription</TH>
          <TH>Product</TH>
          <TH>Customer</TH>
          <TH>Plan</TH>
          <TH align="right">Qty</TH>
          <TH align="right">Per period</TH>
          <TH>Status</TH>
          <TH align="right">Next bill</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id} onClick={() => onOpen(row.id)}>
            <TD className="font-medium text-ink-700">{row.reference}</TD>
            <TD>{row.product || "—"}</TD>
            <TD>{row.customer ? row.customer.name : "—"}</TD>
            <TD>{row.plan ? <Badge>{row.plan}</Badge> : "—"}</TD>
            <TD figure align="right">
              {row.qty}
            </TD>
            <TD figure align="right">
              {formatMoney(row.perPeriod)}
            </TD>
            <TD>
              <StatusPill tone={SUBSCRIPTION_STATUS_TONES[row.status]}>
                {SUBSCRIPTION_STATUS_LABELS[row.status]}
              </StatusPill>
            </TD>
            <TD align="right" className="figure whitespace-nowrap text-sand-600">
              {row.status === "ACTIVE" ? formatDate(row.nextBillingDate) : "—"}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
