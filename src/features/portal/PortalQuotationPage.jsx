import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock, FileText, MessageSquare, X } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Modal,
  Spinner,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  Textarea,
  TR,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import { openPdf } from "../../lib/exports";

// What happened, oldest first, in the customer's own terms. The server decides
// which events they see; this only draws them.
function Timeline({ entries }) {
  if (entries.length === 0) return null;

  return (
    <ol className="space-y-3">
      {entries.map((entry, index) => {
        const isLatest = index === entries.length - 1;

        return (
          <li key={entry.id} className="flex gap-3">
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                isLatest ? "bg-ink-700" : "bg-sand-300"
              }`}
            />
            <div className="flex-1">
              <p
                className={`text-sm ${isLatest ? "font-medium text-sand-900" : "text-sand-700"}`}
              >
                {entry.label}
              </p>
              <p className="figure text-xs text-sand-500">{formatDate(entry.at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function RejectDialog({ open, isBusy, onClose, onConfirm }) {
  const [reason, setReason] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send this back to us"
      description="Tell us what is wrong and we will look at it again. Your rep sees this straight away."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            isLoading={isBusy}
            disabled={reason.trim().length < 5}
            onClick={() => onConfirm(reason.trim())}
          >
            Send it back
          </Button>
        </>
      }
    >
      <Field label="Your reasons" htmlFor="reject-reason" tooltip="Sent back to the sales team with the quotation. Required to decline.">
        <Textarea
          id="reject-reason"
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="The unit price on the laptops is above the budget we were given."
        />
      </Field>
    </Modal>
  );
}

export function PortalQuotationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [isRejecting, setIsRejecting] = useState(false);

  const query = useQuery({
    queryKey: ["portal-quotation", id],
    queryFn: async () => (await api.get(`/portal/quotations/${id}`)).data.quotation,
  });

  function afterDecision(message) {
    queryClient.invalidateQueries({ queryKey: ["portal-quotation", id] });
    queryClient.invalidateQueries({ queryKey: ["portal-quotations"] });
    toast(message);
  }

  const approve = useMutation({
    mutationFn: () => api.post(`/portal/quotations/${id}/approve`),
    onSuccess: () => afterDecision("Approved. We will get this moving straight away."),
    onError: (error) => toast(errorMessage(error), "error"),
  });

  const reject = useMutation({
    mutationFn: (reason) => api.post(`/portal/quotations/${id}/reject`, { reason }),
    onSuccess: () => {
      setIsRejecting(false);
      afterDecision("Sent back. Your rep will be in touch.");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  if (query.isLoading) return <Spinner label="Loading your quotation" />;
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={query.refetch} />;
  }

  const quotation = query.data;
  const isBusy = approve.isPending || reject.isPending;

  return (
    <div className="animate-fadeUp">
      <Button
        variant="ghost"
        size="sm"
        icon={ArrowLeft}
        className="mb-3 -ml-2.5"
        onClick={() => navigate("/portal/quotations")}
      >
        All your quotations
      </Button>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="figure text-2xl font-semibold text-sand-900">{quotation.number}</h1>
          <p className="mt-1 text-sm text-sand-600">
            Asked {formatDate(quotation.createdAt)}
            {quotation.rep && ` · looked after by ${quotation.rep}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill tone={quotation.tone}>{quotation.label}</StatusPill>
          <Button
            variant="secondary"
            icon={FileText}
            onClick={() => openPdf(`/documents/quotations/${quotation.id}.pdf`, toast)}
          >
            Download PDF
          </Button>
        </div>
      </header>

      {quotation.canDecide && (
        <Card className="mb-6 border-state-warnBorder bg-state-warnSoft">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-state-warn" aria-hidden="true" />
              <div>
                <p className="text-base font-medium text-sand-900">
                  This is ready for your decision
                </p>
                <p className="mt-0.5 text-sm text-sand-700">
                  Approving it confirms the order and we start work. Sending it back tells us what
                  to change.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                icon={X}
                disabled={isBusy}
                onClick={() => setIsRejecting(true)}
              >
                Send it back
              </Button>
              <Button icon={Check} isLoading={approve.isPending} onClick={() => approve.mutate()}>
                Approve
              </Button>
            </div>
          </div>
        </Card>
      )}

      {quotation.isReadable ? (
        <Card padded={false} className="mb-6 overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH align="right">Qty</TH>
                <TH align="right">Unit price</TH>
                <TH align="right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {quotation.lines.map((line) => (
                <TR key={line.id}>
                  <TD>
                    <p className="font-medium text-sand-900">{line.productName}</p>
                    <p className="figure text-xs text-sand-600">
                      {line.sku}
                      {line.variantLabel && ` · ${line.variantLabel}`}
                      {line.planName && ` · billed ${line.planName.toLowerCase()}`}
                    </p>
                  </TD>
                  <TD align="right" className="figure">
                    {line.qty}
                  </TD>
                  <TD align="right" className="figure">
                    {formatMoney(line.unitPrice)}
                  </TD>
                  <TD align="right" className="figure">
                    {formatMoney(line.total)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          <div className="flex justify-end border-t border-sand-200 bg-sand-50 px-4 py-3">
            <dl className="w-64 space-y-1 text-sm">
              <div className="flex justify-between text-sand-600">
                <dt>Tax</dt>
                <dd className="figure">{formatMoney(quotation.totals.taxAmount)}</dd>
              </div>
              <div className="flex justify-between border-t border-sand-200 pt-1 text-base font-semibold text-sand-900">
                <dt>Total</dt>
                <dd className="figure">{formatMoney(quotation.totals.grandTotal)}</dd>
              </div>
            </dl>
          </div>
        </Card>
      ) : (
        <Card className="mb-6">
          <p className="text-base text-sand-700">
            We are still putting this together. As soon as it is ready you will get an email and
            the full quotation will appear here.
          </p>
        </Card>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader title="Progress" />
          <Timeline entries={quotation.history} />
        </Card>

        <Card>
          <CardHeader title="What you told us" />
          {quotation.messages.length === 0 ? (
            <p className="text-sm text-sand-600">You have not added any notes to this one.</p>
          ) : (
            <ul className="space-y-3">
              {quotation.messages.map((message) => (
                <li key={message.id} className="flex gap-2.5">
                  <MessageSquare
                    className="mt-0.5 h-4 w-4 shrink-0 text-sand-400"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm text-sand-800">{message.text}</p>
                    <p className="figure mt-0.5 text-xs text-sand-500">
                      {message.by} · {formatDate(message.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <RejectDialog
        open={isRejecting}
        isBusy={reject.isPending}
        onClose={() => setIsRejecting(false)}
        onConfirm={(reason) => reject.mutate(reason)}
      />
    </div>
  );
}
