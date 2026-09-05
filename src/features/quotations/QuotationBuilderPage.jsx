import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Lock, Trash2 } from "lucide-react";
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
  Modal,
  RecordPicker,
  Spinner,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { customerOption, searchCustomers } from "../../lib/pickers";
import { formatDate } from "../../lib/format";
import { StatusBar } from "./StatusBar";
import { TotalsPanel } from "./TotalsPanel";
import { UpsellPanel } from "./UpsellPanel";
import { HistoryTimeline } from "./HistoryTimeline";
import { AddLineControl, BulkDiscountControl, LinesTable } from "./LinesTable";
import { RiskPreview } from "./RiskPreview";
import { ApprovalPanel, canApprove } from "../approvals/ApprovalPanel";
import { FulfilmentPanel } from "../fulfilment/FulfilmentPanel";

// A split only exists once a quotation has been approved.
const SHOWS_FULFILMENT = ["APPROVED", "SENT", "UNDER_NEGOTIATION", "CONFIRMED"];
import { useAuth } from "../../app/AuthProvider";

function dateInputValue(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function QuotationBuilderPage() {
  const { id } = useParams();
  // Opened from the approvals queue, so the breadcrumb and pager follow that
  // queue rather than the full quotation list.
  const [searchParams] = useSearchParams();
  const fromApprovals = searchParams.get("scope") === "approvals";
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [actionError, setActionError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const detail = useQuery({
    queryKey: ["quotation", id],
    queryFn: async () => (await api.get(`/quotations/${id}`)).data.quotation,
  });

  const quotation = detail.data;

  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/catalogue/plans")).data.plans,
  });

  // Every change returns the recalculated quotation, so the screen shows the
  // server's figures rather than working any of them out itself.
  const change = useMutation({
    mutationFn: ({ method, path, body }) => api[method](`/quotations/${id}${path}`, body),
    onSuccess: (response) => {
      setActionError("");
      if (response.data?.quotation) {
        queryClient.setQueryData(["quotation", id], response.data.quotation);
      }
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      // The server says what it did, because a merged line or a discount
      // written across lines is not visible from where the click happened.
      if (response.data?.message) toast(response.data.message);
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const duplicate = useMutation({
    mutationFn: () => api.post(`/quotations/${id}/duplicate`),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      toast(`Copied to ${response.data.number}`);
      navigate(`/quotations/${response.data.id}`);
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/quotations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      toast(`${quotation.number} deleted`);
      navigate("/quotations");
    },
    onError: (error) => {
      setConfirmDelete(false);
      setActionError(errorMessage(error));
    },
  });

  if (detail.isLoading) return <Spinner label="Loading quotation" />;
  if (detail.isError) {
    return <ErrorState message={errorMessage(detail.error)} onRetry={detail.refetch} />;
  }

  const isBusy = change.isPending || duplicate.isPending || remove.isPending;
  const canEdit = quotation.isEditable;
  // Recording that the customer agreed; the portal route ends in the same place.
  const canAccept = ["APPROVED", "SENT"].includes(quotation.status);
  const hasApproval = (quotation.approval?.steps || []).length > 0;

  return (
    <div className="animate-fadeUp">
      <RecordNav
        listLabel={fromApprovals ? "Approvals" : "Quotations"}
        listTo={fromApprovals ? "/approvals" : "/quotations"}
        recordId={quotation.number}
        neighboursPath={
          fromApprovals
            ? `/approvals/${quotation.id}/neighbours`
            : `/quotations/${quotation.id}/neighbours`
        }
        recordTo={(nextId) => `/quotations/${nextId}`}
      />

      <PageHeader
        title={quotation.number}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <RecordLink to={`/customers/${quotation.customer.id}`}>
              {quotation.customer.name}
            </RecordLink>
            {/* Tier belongs to the customer, not to the stage the deal is at. */}
            <Badge>
              {quotation.customer.tier} · ceiling {quotation.customer.maxDiscountPct}%
            </Badge>
            <span className="text-sand-600">
              · created {formatDate(quotation.createdAt)}
              {quotation.rep && <> · {quotation.rep.name}</>}
            </span>
          </span>
        }
        actions={
          <>
            <Button variant="secondary" icon={Copy} disabled={isBusy} onClick={() => duplicate.mutate()}>
              Duplicate
            </Button>
            <Button
              variant="secondary"
              icon={Trash2}
              disabled={isBusy}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
            {canEdit && (
              <Button
                disabled={isBusy || quotation.lines.length === 0}
                onClick={() => change.mutate({ method: "post", path: "/confirm" })}
              >
                Confirm
              </Button>
            )}
            {canAccept && (
              <Button
                icon={Check}
                disabled={isBusy}
                onClick={() => change.mutate({ method: "post", path: "/accept" })}
              >
                Mark as accepted
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5">
        <StatusBar status={quotation.status} />
      </div>

      {!canEdit && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-sm text-sand-700">
          <Lock className="h-4 w-4 shrink-0 text-sand-500" aria-hidden="true" />
          This quotation is no longer open for changes.
        </p>
      )}

      {actionError && (
        <p className="mb-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
          {actionError}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer" htmlFor="customer">
                <RecordPicker
                  id="customer"
                  queryKey="customers"
                  fetchOptions={searchCustomers}
                  value={quotation.customer.id}
                  selected={customerOption(quotation.customer)}
                  disabled={!canEdit || isBusy}
                  openTo={(customerId) => `/customers/${customerId}`}
                  onChange={(option) =>
                    option &&
                    change.mutate({
                      method: "patch",
                      path: "",
                      body: { customerId: option.id },
                    })
                  }
                  noun="customers"
                />
              </Field>

              {/* Read from the customer record, so it never goes stale here. */}
              <Field label="Contact">
                <p className="py-2 text-base text-sand-800">
                  {quotation.customer.email}
                  {quotation.customer.phone && <> · {quotation.customer.phone}</>}
                </p>
              </Field>

              <Field
                label="Inquiry date"
                htmlFor="inquiry"
                hint="When the customer got in touch."
              >
                <Input
                  id="inquiry"
                  type="date"
                  disabled={!canEdit || isBusy}
                  defaultValue={dateInputValue(quotation.inquiryDate)}
                  onBlur={(event) =>
                    change.mutate({
                      method: "patch",
                      path: "",
                      body: { inquiryDate: event.target.value || null },
                    })
                  }
                />
              </Field>

              <Field
                label="Requested delivery"
                htmlFor="requested"
                hint="The date the customer asked for."
              >
                <Input
                  id="requested"
                  type="date"
                  disabled={!canEdit || isBusy}
                  defaultValue={dateInputValue(quotation.requestedDeliveryDate)}
                  onBlur={(event) =>
                    change.mutate({
                      method: "patch",
                      path: "",
                      body: { requestedDeliveryDate: event.target.value || null },
                    })
                  }
                />
              </Field>
            </div>
          </Card>

          {canEdit && quotation.lines.length > 0 && (
            <RiskPreview risk={quotation.risk} routing={quotation.routing} />
          )}

          <div>
            <LinesTable
              lines={quotation.lines}
              plans={plans.data || []}
              isEditable={canEdit}
              isBusy={isBusy}
              onUpdateLine={(lineId, body) =>
                change.mutate({ method: "patch", path: `/lines/${lineId}`, body })
              }
              onRemoveLine={(lineId) =>
                change.mutate({ method: "delete", path: `/lines/${lineId}` })
              }
            />

            {canEdit && (
              <>
                <AddLineControl
                  tierId={quotation.customer.tierId}
                  plans={plans.data || []}
                  isBusy={isBusy}
                  onAdd={(body) => change.mutate({ method: "post", path: "/lines", body })}
                />

                {quotation.lines.length > 0 && (
                  <div className="mt-3">
                    <BulkDiscountControl
                      lines={quotation.lines}
                      isBusy={isBusy}
                      onApply={(discountPct) =>
                        change.mutate({
                          method: "post",
                          path: "/lines/discount",
                          body: { discountPct },
                        })
                      }
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {hasApproval && (
            <ApprovalPanel quotation={quotation} canAct={canApprove(user, quotation)} />
          )}

          {SHOWS_FULFILMENT.includes(quotation.status) && (
            <FulfilmentPanel quotation={quotation} />
          )}

          <HistoryTimeline history={quotation.history} />
        </div>

        <div className="space-y-5">
          <TotalsPanel totals={quotation.totals} />

          {quotation.suggestions && (
            <UpsellPanel
              suggestions={quotation.suggestions}
              isEditable={canEdit}
              isBusy={isBusy}
              onAdd={(item) =>
                change.mutate({
                  method: "post",
                  path: "/lines",
                  body: { productId: item.productId },
                })
              }
              onDismiss={(item) =>
                change.mutate({
                  method: "post",
                  path: `/suggestions/${item.productId}/dismiss`,
                })
              }
            />
          )}
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${quotation.number}?`}
        description="The quotation and its lines are removed. This cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button variant="danger" isLoading={remove.isPending} onClick={() => remove.mutate()}>
              Delete quotation
            </Button>
          </>
        }
      >
        <p className="text-base text-sand-700">
          {quotation.customer.name} · {quotation.lines.length}{" "}
          {quotation.lines.length === 1 ? "line" : "lines"}
        </p>
      </Modal>
    </div>
  );
}
