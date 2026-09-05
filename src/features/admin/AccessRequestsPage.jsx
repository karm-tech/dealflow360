import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldX } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Spinner,
  StatusPill,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate } from "../../lib/format";
import {
  ROLE_LABELS,
  USER_STATUS,
  USER_STATUS_LABELS,
  USER_STATUS_TONES,
} from "../../lib/constants";

// One card per person waiting on a decision. The role picker starts on what
// they asked for as a convenience, but the admin can change it to anything —
// which is the whole point of the screen.
function RequestCard({ request, assignableRoles, onApprove, onReject, isBusy }) {
  const [role, setRole] = useState(request.requestedRole || assignableRoles[0]);
  const [reason, setReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const isPending = request.status === USER_STATUS.PENDING;

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <p className="text-lg font-medium text-sand-900">{request.name}</p>
          <p className="text-base text-sand-600">{request.email}</p>
          <p className="mt-1 text-xs text-sand-500">
            Requested {formatDate(request.createdAt)}
            {request.requestedRole && <> · asked for {ROLE_LABELS[request.requestedRole]}</>}
          </p>
        </div>

        <StatusPill tone={USER_STATUS_TONES[request.status]}>
          {USER_STATUS_LABELS[request.status]}
        </StatusPill>
      </div>

      {!isPending && request.rejectionReason && (
        <p className="border-t border-sand-200 bg-sand-50 px-5 py-3 text-base text-sand-700">
          Declined: {request.rejectionReason}
          {request.approvedBy && <> — by {request.approvedBy}</>}
        </p>
      )}

      {isPending && !isRejecting && (
        <div className="flex flex-wrap items-end gap-3 border-t border-sand-200 bg-sand-50 px-5 py-4">
          <div className="min-w-[12rem]">
            <Field label="Give this person the role" htmlFor={`role-${request.id}`}>
              <Select
                id={`role-${request.id}`}
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                {assignableRoles.map((option) => (
                  <option key={option} value={option}>
                    {ROLE_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Button icon={ShieldCheck} disabled={isBusy} onClick={() => onApprove(request.id, role)}>
            Approve
          </Button>

          <Button
            variant="secondary"
            icon={ShieldX}
            disabled={isBusy}
            onClick={() => setIsRejecting(true)}
          >
            Decline
          </Button>
        </div>
      )}

      {isPending && isRejecting && (
        <div className="border-t border-sand-200 bg-sand-50 px-5 py-4">
          <Field
            label="Why are you declining?"
            htmlFor={`reason-${request.id}`}
            hint="The person is told this, so keep it clear and polite."
          >
            <div className="flex flex-wrap gap-2">
              <Input
                id={`reason-${request.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Not a member of the sales team"
                className="min-w-[16rem] flex-1"
              />
              <Button
                variant="danger"
                disabled={isBusy || reason.trim().length < 3}
                onClick={() => onReject(request.id, reason)}
              >
                Confirm decline
              </Button>
              <Button variant="secondary" onClick={() => setIsRejecting(false)}>
                Cancel
              </Button>
            </div>
          </Field>
        </div>
      )}
    </Card>
  );
}

export function AccessRequestsPage() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");

  const requests = useQuery({
    queryKey: ["access-requests"],
    queryFn: async () => (await api.get("/admin/access-requests")).data,
  });

  const decide = useMutation({
    mutationFn: ({ id, action, body }) => api.post(`/admin/access-requests/${id}/${action}`, body),
    onSuccess: () => {
      setActionError("");
      queryClient.invalidateQueries({ queryKey: ["access-requests"] });
      // The approved person now shows up as a demo account on the login screen.
      queryClient.invalidateQueries({ queryKey: ["demo-accounts"] });
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  if (requests.isLoading) return <Spinner label="Loading access requests" />;
  if (requests.isError) {
    return <ErrorState message={errorMessage(requests.error)} onRetry={requests.refetch} />;
  }

  const rows = requests.data.requests;
  const pendingCount = rows.filter((row) => row.status === USER_STATUS.PENDING).length;

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Access Requests"
        subtitle={
          pendingCount > 0
            ? `${pendingCount} ${pendingCount === 1 ? "person is" : "people are"} waiting for a decision.`
            : "Nobody is waiting for a decision."
        }
      />

      {actionError && (
        <p className="mb-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
          {actionError}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No access requests"
          hint="When someone requests access they appear here for you to approve or decline."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              assignableRoles={requests.data.assignableRoles}
              isBusy={decide.isPending}
              onApprove={(id, role) => decide.mutate({ id, action: "approve", body: { role } })}
              onReject={(id, reason) => decide.mutate({ id, action: "reject", body: { reason } })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
