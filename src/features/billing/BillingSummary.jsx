import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { Card, EmptyState, ErrorState, Spinner, StatusPill } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_TONES,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONES,
} from "../../lib/constants";

// What a salesperson needs to know about billing on their own order: what has
// been invoiced, what is still owed, and what recurs. The invoices and
// subscriptions are documents of their own, so acting on them happens there.
export function BillingSummary({ quotation }) {
  const billing = useQuery({
    queryKey: ["billing", quotation.id],
    queryFn: async () => (await api.get(`/billing/quotation/${quotation.id}`)).data.billing,
  });

  if (billing.isLoading) return <Spinner label="Loading billing" />;
  if (billing.isError) {
    return <ErrorState message={errorMessage(billing.error)} onRetry={billing.refetch} />;
  }

  const view = billing.data;

  if (view.invoiceCount === 0 && view.subscriptionCount === 0) {
    return (
      <Card>
        <EmptyState
          title="Not billed yet"
          hint="Confirming the order raises the first invoice and opens a subscription for every recurring line."
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold text-sand-900">Billing</h2>
        <Link
          to={`/billing?quotationId=${quotation.id}`}
          className="text-sm font-medium text-ink-700 hover:underline"
        >
          {view.invoiceCount} invoice{view.invoiceCount === 1 ? "" : "s"}
        </Link>
      </div>

      <ul className="mb-3 space-y-1.5">
        {view.invoices.map((invoice) => (
          <li key={invoice.id} className="flex items-center justify-between gap-3 text-sm">
            <Link to={`/billing/invoices/${invoice.id}`} className="text-ink-700 hover:underline">
              {invoice.number}
            </Link>
            <span className="flex items-center gap-1.5">
              <span className="figure text-sand-700">{formatMoney(invoice.total)}</span>
              <StatusPill tone={INVOICE_STATUS_TONES[invoice.status]}>
                {INVOICE_STATUS_LABELS[invoice.status]}
              </StatusPill>
            </span>
          </li>
        ))}
      </ul>

      {view.subscriptionCount > 0 && (
        <div className="mb-3 border-t border-sand-200 pt-3">
          <p className="mb-1.5 text-xs uppercase tracking-wide text-sand-500">Recurring</p>
          <ul className="space-y-1.5">
            {view.subscriptions.map((subscription) => (
              <li
                key={subscription.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <Link
                  to={`/billing/subscriptions/${subscription.id}`}
                  className="text-ink-700 hover:underline"
                >
                  {subscription.product}
                </Link>
                <span className="flex items-center gap-1.5">
                  <span className="figure text-sand-700">
                    {formatMoney(subscription.perPeriod)}
                  </span>
                  <StatusPill tone={SUBSCRIPTION_STATUS_TONES[subscription.status]}>
                    {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                  </StatusPill>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="space-y-1 border-t border-sand-200 pt-3 text-sm">
        <Row label="Invoiced so far" value={formatMoney(view.invoicedTotal)} />
        <Row
          label="Outstanding"
          value={formatMoney(view.outstanding)}
          tone={view.hasOverdue ? "bad" : undefined}
        />
        {view.recurringMonthly > 0 && (
          <Row label="Recurring" value={`${formatMoney(view.recurringMonthly)} / month`} />
        )}
        {view.nextBillingDate && (
          <Row label="Next bill" value={formatDate(view.nextBillingDate)} />
        )}
      </dl>

      {view.hasOverdue && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-state-bad">
          <TriangleAlert size={13} />
          An invoice on this order is past its due date.
        </p>
      )}
    </Card>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <dt className="text-sand-600">{label}</dt>
      <dd className={`figure ${tone === "bad" ? "font-medium text-state-bad" : "text-sand-900"}`}>
        {value}
      </dd>
    </div>
  );
}
