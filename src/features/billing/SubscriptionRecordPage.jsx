import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarClock, Pause, Play, Receipt } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { RecordLink } from "../../components/RecordLink";
import { RecordNav } from "../../components/RecordNav";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  SmartButton,
  SmartButtons,
  Spinner,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import {
  ROLES,
  SCHEDULE_STATUS_LABELS,
  SCHEDULE_STATUS_TONES,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONES,
} from "../../lib/constants";
import { useAuth } from "../../app/AuthProvider";
import { CancelSubscriptionModal } from "./CancelSubscriptionModal";

const BILLING_ROLES = [ROLES.ADMIN, ROLES.FINANCE];

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function SubscriptionRecordPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showCancel, setShowCancel] = useState(false);
  const [actionError, setActionError] = useState("");

  const record = useQuery({
    queryKey: ["subscription-record", id],
    queryFn: async () => (await api.get(`/billing/subscriptions/${id}`)).data.subscription,
  });

  // A change here moves money, so the invoice screens and the order's summary
  // are refetched alongside the record itself.
  function applyResult(data) {
    queryClient.setQueryData(["subscription-record", id], data.subscription);
    queryClient.invalidateQueries({ queryKey: ["billing-list"] });
    queryClient.invalidateQueries({ queryKey: ["billing"] });
    queryClient.invalidateQueries({ queryKey: ["invoice-record"] });
    setActionError("");
    toast(data.message);
  }

  const setPaused = useMutation({
    mutationFn: async (paused) => api.post(`/billing/subscriptions/${id}/pause`, { paused }),
    onSuccess: (response) => applyResult(response.data),
    onError: (error) => setActionError(errorMessage(error)),
  });

  if (record.isLoading) return <Spinner label="Loading subscription" />;
  if (record.isError) {
    return <ErrorState message={errorMessage(record.error)} onRetry={record.refetch} />;
  }

  const subscription = record.data;
  const canAct = BILLING_ROLES.includes(user.role);
  const isRunning = ["ACTIVE", "PAUSED"].includes(subscription.status);
  const invoiceCount = new Set(
    subscription.schedule.filter((row) => row.invoice).map((row) => row.invoice.id),
  ).size;

  return (
    <div className="animate-fadeUp">
      <RecordNav
        listLabel="Billing"
        listTo="/billing"
        recordId={subscription.reference}
        neighboursPath={`/billing/subscriptions/${subscription.id}/neighbours`}
        recordTo={(nextId) => `/billing/subscriptions/${nextId}`}
      />

      <PageHeader
        title={subscription.reference}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sand-900">{subscription.product}</span>
            {subscription.customer && (
              <RecordLink to={`/customers/${subscription.customer.id}`}>
                {subscription.customer.name}
              </RecordLink>
            )}
            <StatusPill tone={SUBSCRIPTION_STATUS_TONES[subscription.status]}>
              {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
            </StatusPill>
            {subscription.plan && <Badge>{subscription.plan}</Badge>}
          </span>
        }
        aside={
          <SmartButtons>
            <SmartButton
              count={subscription.schedule.length}
              label="Periods"
              icon={CalendarClock}
              onClick={() => scrollTo("schedule")}
            />
            <SmartButton
              count={invoiceCount}
              label="Invoices"
              icon={Receipt}
              to={
                subscription.quotation
                  ? `/billing?view=invoices&quotationId=${subscription.quotation.id}`
                  : undefined
              }
            />
          </SmartButtons>
        }
        actions={
          canAct &&
          isRunning && (
            <>
              <Button
                variant="secondary"
                icon={subscription.status === "PAUSED" ? Play : Pause}
                isLoading={setPaused.isPending}
                onClick={() => setPaused.mutate(subscription.status !== "PAUSED")}
              >
                {subscription.status === "PAUSED" ? "Resume" : "Pause"}
              </Button>
              <Button variant="danger" icon={Ban} onClick={() => setShowCancel(true)}>
                Cancel
              </Button>
            </>
          )
        }
      />

      {subscription.status === "PAUSED" && (
        <p className="mb-4 rounded-lg border border-state-warnBorder bg-state-warnSoft px-3 py-2 text-sm text-state-warn">
          Paused. Its periods stay on the schedule but nothing is invoiced while it is paused.
        </p>
      )}

      {subscription.status === "CANCELLED" && (
        <p className="mb-4 rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-sm text-sand-700">
          Cancelled {formatDate(subscription.cancelledAt)}. Periods after that date were removed;
          invoices already raised are untouched.
        </p>
      )}

      {actionError && (
        <p className="mb-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-sm text-state-bad">
          {actionError}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div id="schedule" className="scroll-mt-24">
          <h2 className="mb-1 text-xl font-semibold text-sand-900">Billing schedule</h2>
          <p className="mb-3 text-sm text-sand-600">
            Twelve months ahead, whatever the interval. A period charged for part of its length is
            marked.
          </p>
          <Table>
            <THead>
              <TR>
                <TH>Period</TH>
                <TH>Invoice</TH>
                <TH>Status</TH>
                <TH align="right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {subscription.schedule.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <span className="figure">
                      {formatDate(row.periodStart)} – {formatDate(row.periodEnd)}
                    </span>
                    {row.isProrated && <Badge className="ml-2">Part period</Badge>}
                  </TD>
                  <TD>
                    {row.invoice ? (
                      <RecordLink to={`/billing/invoices/${row.invoice.id}`}>
                        {row.invoice.number}
                      </RecordLink>
                    ) : (
                      <span className="text-sand-500">—</span>
                    )}
                  </TD>
                  <TD>
                    <StatusPill tone={SCHEDULE_STATUS_TONES[row.status]}>
                      {SCHEDULE_STATUS_LABELS[row.status]}
                    </StatusPill>
                  </TD>
                  <TD figure align="right">
                    {formatMoney(row.amount)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 text-xl font-semibold text-sand-900">Details</h2>
            <dl className="space-y-3 text-sm">
              <Detail label="Source document">
                {subscription.quotation ? (
                  <RecordLink to={`/quotations/${subscription.quotation.id}`}>
                    {subscription.quotation.number}
                  </RecordLink>
                ) : (
                  "—"
                )}
              </Detail>
              <Detail label="Per period">
                <span className="figure font-medium">{formatMoney(subscription.perPeriod)}</span>
                <span className="text-sand-500">
                  {" "}
                  · {subscription.qty} × {formatMoney(subscription.unitPrice)}
                  {subscription.discountPct > 0 && ` less ${subscription.discountPct}%`}
                </span>
              </Detail>
              <Detail label="Started">
                <span className="figure">{formatDate(subscription.startDate)}</span>
              </Detail>
              <Detail label="Next bill">
                <span className="figure">
                  {subscription.status === "ACTIVE"
                    ? formatDate(subscription.nextBillingDate)
                    : "—"}
                </span>
              </Detail>
              {subscription.endDate && (
                <Detail label="Ends">
                  <span className="figure">{formatDate(subscription.endDate)}</span>
                </Detail>
              )}
            </dl>
          </Card>

          {canAct && subscription.status === "ACTIVE" && (
            <QuantityControl
              key={subscription.qty}
              subscription={subscription}
              onChanged={applyResult}
              onError={setActionError}
            />
          )}
        </div>
      </div>

      <CancelSubscriptionModal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        subscription={subscription}
        onSaved={applyResult}
      />
    </div>
  );
}

// Quantity takes effect today: the days already covered stay paid for, and the
// difference for the rest of the period rides on the next one.
function QuantityControl({ subscription, onChanged, onError }) {
  const [qty, setQty] = useState(String(subscription.qty));

  const change = useMutation({
    mutationFn: async () =>
      api.post(`/billing/subscriptions/${subscription.id}/qty`, { qty: Number(qty) }),
    onSuccess: (response) => onChanged(response.data),
    onError: (error) => onError(errorMessage(error)),
  });

  return (
    <Card>
      <h2 className="mb-3 text-xl font-semibold text-sand-900">Change quantity</h2>
      <Field
        label="Quantity"
        htmlFor="qty"
        hint="Applies from today. The remaining days of this period are charged at the difference and carried onto the next."
      >
        <div className="flex gap-2">
          <Input
            id="qty"
            type="number"
            min={1}
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            className="!w-24"
          />
          <Button
            isLoading={change.isPending}
            disabled={!qty || Number(qty) === subscription.qty}
            onClick={() => {
              onError("");
              change.mutate();
            }}
          >
            Update
          </Button>
        </div>
      </Field>
    </Card>
  );
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-sand-500">{label}</dt>
      <dd className="mt-0.5 text-sand-900">{children}</dd>
    </div>
  );
}
