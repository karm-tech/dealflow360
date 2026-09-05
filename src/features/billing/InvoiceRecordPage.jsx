import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, FileText, Repeat, TriangleAlert, Undo2 } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { RecordLink } from "../../components/RecordLink";
import { RecordNav } from "../../components/RecordNav";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
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
import { openPdf } from "../../lib/exports";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_TONES,
  PAYMENT_METHOD_LABELS,
  ROLES,
} from "../../lib/constants";
import { useAuth } from "../../app/AuthProvider";
import { PaymentModal } from "./PaymentModal";

const BILLING_ROLES = [ROLES.ADMIN, ROLES.FINANCE];

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function InvoiceRecordPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showPayment, setShowPayment] = useState(false);

  const record = useQuery({
    queryKey: ["invoice-record", id],
    queryFn: async () => (await api.get(`/billing/invoices/${id}`)).data.invoice,
  });

  if (record.isLoading) return <Spinner label="Loading invoice" />;
  if (record.isError) {
    return <ErrorState message={errorMessage(record.error)} onRetry={record.refetch} />;
  }

  const invoice = record.data;
  const canAct = BILLING_ROLES.includes(user.role);
  const isSettled = invoice.outstanding <= 0;

  return (
    <div className="animate-fadeUp">
      <RecordNav
        listLabel="Billing"
        listTo="/billing"
        recordId={invoice.number}
        neighboursPath={`/billing/invoices/${invoice.id}/neighbours`}
        recordTo={(nextId) => `/billing/invoices/${nextId}`}
      />

      <PageHeader
        title={invoice.number}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {invoice.customer && (
              <RecordLink to={`/customers/${invoice.customer.id}`}>
                {invoice.customer.name}
              </RecordLink>
            )}
            <StatusPill tone={INVOICE_STATUS_TONES[invoice.status]}>
              {INVOICE_STATUS_LABELS[invoice.status]}
            </StatusPill>
            {invoice.isOverdue && <StatusPill tone="bad">Overdue</StatusPill>}
            <span className="text-sand-600">· issued {formatDate(invoice.issueDate)}</span>
          </span>
        }
        aside={
          <SmartButtons>
            <SmartButton
              count={invoice.payments.length}
              label="Payments"
              icon={Banknote}
              onClick={() => scrollTo("payments")}
            />
            <SmartButton
              count={invoice.creditNotes.length}
              label="Credit notes"
              icon={Undo2}
              onClick={() => scrollTo("credit-notes")}
            />
          </SmartButtons>
        }
        actions={
          <>
            <Button
              variant="secondary"
              icon={FileText}
              onClick={() => openPdf(`/documents/invoices/${invoice.id}.pdf`, toast)}
            >
              PDF
            </Button>
            {canAct && !isSettled && (
              <Button icon={Banknote} onClick={() => setShowPayment(true)}>
                Record a payment
              </Button>
            )}
          </>
        }
      />

      {invoice.isOverdue && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-sm text-state-bad">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          Was due {formatDate(invoice.dueDate)} and {formatMoney(invoice.outstanding)} is still
          outstanding.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-5">
          <div>
            <h2 className="mb-1 text-xl font-semibold text-sand-900">What is being charged</h2>
            <p className="mb-3 text-sm text-sand-600">
              A recurring line appears here only for the period this invoice covers.
            </p>
            <Table>
              <THead>
                <TR>
                  <TH>Description</TH>
                  <TH align="right">Qty</TH>
                  <TH align="right">Unit price</TH>
                  <TH align="right">Discount</TH>
                  <TH align="right">Tax</TH>
                  <TH align="right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {invoice.lines.map((line) => (
                  <TR key={line.id}>
                    <TD>{line.description}</TD>
                    <TD figure align="right">
                      {line.qty}
                    </TD>
                    <TD figure align="right">
                      {formatMoney(line.unitPrice)}
                    </TD>
                    <TD figure align="right">
                      {line.discountPct ? `${line.discountPct}%` : "—"}
                    </TD>
                    <TD figure align="right">
                      {line.taxRatePct ? `${line.taxRatePct}%` : "—"}
                    </TD>
                    <TD figure align="right">
                      {formatMoney(line.lineTotal)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>

          <div id="payments" className="scroll-mt-24">
            <h2 className="mb-1 text-xl font-semibold text-sand-900">Payments</h2>
            <p className="mb-3 text-sm text-sand-600">
              The status of this invoice follows what has been received against it.
            </p>
            {invoice.payments.length === 0 ? (
              <Card>
                <EmptyState
                  title="Nothing received yet"
                  hint="Recording a payment moves the invoice to part paid or paid on its own."
                />
              </Card>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Received</TH>
                    <TH>Method</TH>
                    <TH>Reference</TH>
                    <TH align="right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {invoice.payments.map((payment) => (
                    <TR key={payment.id}>
                      <TD>
                        <span className="figure">{formatDate(payment.paidAt)}</span>
                        {payment.isLate && (
                          <StatusPill tone="warn" className="ml-2">
                            Late
                          </StatusPill>
                        )}
                      </TD>
                      <TD>{PAYMENT_METHOD_LABELS[payment.method] || payment.method}</TD>
                      <TD className="text-sand-600">{payment.reference || "—"}</TD>
                      <TD figure align="right">
                        {formatMoney(payment.amount)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>

          {invoice.creditNotes.length > 0 && (
            <div id="credit-notes" className="scroll-mt-24">
              <h2 className="mb-1 text-xl font-semibold text-sand-900">Credit notes</h2>
              <p className="mb-3 text-sm text-sand-600">
                Raised against this invoice, and taken off what is owed on it.
              </p>
              <Table>
                <THead>
                  <TR>
                    <TH>Note</TH>
                    <TH>Reason</TH>
                    <TH align="right">Raised</TH>
                    <TH align="right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {invoice.creditNotes.map((note) => (
                    <TR key={note.id}>
                      <TD className="font-medium text-ink-700">{note.number}</TD>
                      <TD>{note.reason}</TD>
                      <TD figure align="right" className="text-sand-600">
                        {formatDate(note.createdAt)}
                      </TD>
                      <TD figure align="right">
                        −{formatMoney(note.amount)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}

          {invoice.periods.length > 0 && (
            <div>
              <h2 className="mb-1 text-xl font-semibold text-sand-900">Periods covered</h2>
              <p className="mb-3 text-sm text-sand-600">
                The subscription periods this invoice paid for. A short first period is charged at a
                daily rate.
              </p>
              <Table>
                <THead>
                  <TR>
                    <TH>Subscription</TH>
                    <TH>Period</TH>
                    <TH align="right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {invoice.periods.map((period) => (
                    <TR key={period.id}>
                      <TD>
                        <RecordLink to={`/billing/subscriptions/${period.subscriptionId}`}>
                          Subscription
                        </RecordLink>
                      </TD>
                      <TD>
                        <span className="figure">
                          {formatDate(period.periodStart)} – {formatDate(period.periodEnd)}
                        </span>
                        {period.isProrated && (
                          <Badge className="ml-2">Part period</Badge>
                        )}
                      </TD>
                      <TD figure align="right">
                        {formatMoney(period.amount)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 text-xl font-semibold text-sand-900">Amount owed</h2>
            <dl className="space-y-1 text-sm">
              <Row label="Subtotal" value={formatMoney(invoice.subtotal)} />
              <Row label="Tax" value={formatMoney(invoice.taxAmount)} />
              <Row label="Invoice total" value={formatMoney(invoice.total)} strong />
              <div className="border-t border-sand-200 pt-1">
                <Row label="Received" value={formatMoney(invoice.paid)} />
                {invoice.credited > 0 && (
                  <Row label="Credited" value={`−${formatMoney(invoice.credited)}`} />
                )}
                <Row
                  label="Outstanding"
                  value={formatMoney(invoice.outstanding)}
                  strong
                  tone={invoice.outstanding > 0 ? (invoice.isOverdue ? "bad" : undefined) : "ok"}
                />
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-semibold text-sand-900">Details</h2>
            <dl className="space-y-3 text-sm">
              <Detail label="Source document">
                {invoice.quotation ? (
                  <RecordLink to={`/quotations/${invoice.quotation.id}`}>
                    {invoice.quotation.number}
                  </RecordLink>
                ) : (
                  "—"
                )}
              </Detail>
              <Detail label="Issued">
                <span className="figure">{formatDate(invoice.issueDate)}</span>
              </Detail>
              <Detail label="Due">
                <span className={`figure ${invoice.isOverdue ? "font-medium text-state-bad" : ""}`}>
                  {formatDate(invoice.dueDate)}
                </span>
              </Detail>
            </dl>

            {invoice.periods.length > 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-sand-600">
                <Repeat size={13} />
                Covers {invoice.periods.length} subscription period
                {invoice.periods.length === 1 ? "" : "s"}.
              </p>
            )}
          </Card>
        </div>
      </div>

      <PaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        invoice={invoice}
        onSaved={(data) => {
          queryClient.setQueryData(["invoice-record", id], data.invoice);
          queryClient.invalidateQueries({ queryKey: ["billing-list"] });
          queryClient.invalidateQueries({ queryKey: ["billing"] });
          toast(data.message);
        }}
      />
    </div>
  );
}

function Row({ label, value, strong = false, tone }) {
  const toneClass = tone === "bad" ? "text-state-bad" : tone === "ok" ? "text-state-ok" : "text-sand-900";
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <dt className={strong ? "font-medium text-sand-800" : "text-sand-600"}>{label}</dt>
      <dd className={`figure ${strong ? "font-semibold" : ""} ${toneClass}`}>{value}</dd>
    </div>
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
