import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CornerUpLeft, X } from "lucide-react";
import { Button, Card, CardHeader, Field, StatusPill, Textarea, useToast } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { shortStockLines } from "../../lib/stock";
import { useAuth } from "../../app/AuthProvider";
import { APPROVAL_STATUS_LABELS, APPROVAL_STATUS_TONES, ROLE_LABELS, ROLES } from "../../lib/constants";
import { RiskSummary, RiskBreakdown } from "./RiskBreakdown";
import { StockProceedModal } from "../quotations/StockProceedModal";

// A step waits on a role rather than a person, so the marker shows the role and
// the decision shows who took it.
function StepRow({ step, isCurrent }) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${isCurrent ? "bg-ink-700" : "bg-sand-300"}`}
      />
      <span className="text-base font-medium text-sand-900">{ROLE_LABELS[step.role]}</span>
      <StatusPill tone={APPROVAL_STATUS_TONES[step.status]}>
        {APPROVAL_STATUS_LABELS[step.status]}
      </StatusPill>
      {step.actor && (
        <span className="text-sm text-sand-600">
          {step.actor} · {formatDate(step.actedAt)}
        </span>
      )}
      {step.reason && <span className="w-full text-sm text-sand-600">“{step.reason}”</span>}
    </li>
  );
}

export function ApprovalPanel({ quotation, canAct }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState(null);

  const DECISION_SAID = {
    approve: "Approved",
    reject: "Rejected",
    return: "Returned for revision",
  };

  const decide = useMutation({
    mutationFn: (action) => api.post(`/approvals/${quotation.id}/${action}`, { reason }),
    onSuccess: (_response, action) => {
      setError("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["quotation", String(quotation.id)] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast(`${quotation.number} · ${DECISION_SAID[action] || "Done"}`);
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const steps = quotation.approval?.steps || [];
  const isOwnQuotation = quotation.rep?.id === user.id;
  const showActions = canAct && steps.some((step) => step.status === "PENDING");
  const shortLines = shortStockLines(quotation.lines);

  function requestDecision(action) {
    if (shortLines.length) {
      setPendingAction(action);
      return;
    }
    decide.mutate(action);
  }

  return (
    <Card>
      <CardHeader
        title="Approval"
        subtitle={`Routed on a blended risk score of ${quotation.risk.score} points`}
      />

      <div className="space-y-5">
        <RiskSummary risk={quotation.risk} />
        <RiskBreakdown risk={quotation.risk} />

        {steps.length > 0 && (
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wide text-sand-600">Chain</p>
            <ol className="divide-y divide-sand-200">
              {steps.map((step) => (
                <StepRow key={step.id} step={step} isCurrent={step.id === quotation.approval.currentStepId} />
              ))}
            </ol>
          </div>
        )}

        {isOwnQuotation && steps.length > 0 && (
          <p className="rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-sm text-sand-700">
            You raised this quotation, so it is waiting on someone else to approve.
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
            {error}
          </p>
        )}

        {showActions && (
          <div className="space-y-3 border-t border-sand-200 pt-4">
            <Field
              label="Reason"
              htmlFor="approval-reason"
              hint="Required when rejecting or returning."
              tooltip="Written on the quotation timeline. The rep sees this when the deal comes back."
            >
              <Textarea
                id="approval-reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="What should the rep know?"
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button icon={Check} isLoading={decide.isPending} onClick={() => requestDecision("approve")}>
                Approve
              </Button>
              <Button
                variant="secondary"
                icon={CornerUpLeft}
                disabled={decide.isPending}
                onClick={() => requestDecision("return")}
              >
                Return for revision
              </Button>
              <Button
                variant="danger"
                icon={X}
                disabled={decide.isPending}
                onClick={() => requestDecision("reject")}
              >
                Reject
              </Button>
            </div>
          </div>
        )}
      </div>

      <StockProceedModal
        open={Boolean(pendingAction)}
        lines={shortLines}
        actionLabel="Yes, proceed"
        onClose={() => setPendingAction(null)}
        onProceed={() => {
          decide.mutate(pendingAction);
          setPendingAction(null);
        }}
      />
    </Card>
  );
}

export function canApprove(user, quotation) {
  const steps = quotation.approval?.steps || [];
  const current = steps.find((step) => step.id === quotation.approval?.currentStepId);
  if (!current) return false;
  if (quotation.rep?.id === user.id) return false;
  return user.role === current.role || user.role === ROLES.ADMIN;
}
