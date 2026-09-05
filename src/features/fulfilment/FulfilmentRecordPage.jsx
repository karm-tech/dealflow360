import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageCheck, Truck, TriangleAlert } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { RecordLink } from "../../components/RecordLink";
import { RecordNav } from "../../components/RecordNav";
import {
  Button,
  Card,
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
import { FULFILMENT_STATUS_LABELS, FULFILMENT_STATUS_TONES, ROLES } from "../../lib/constants";
import { useAuth } from "../../app/AuthProvider";
import { OverrideModal } from "./OverrideModal";

const OPS_ROLES = [ROLES.ADMIN, ROLES.FINANCE];

const VALIDATE_LABEL = {
  ACCEPTED: "Mark as shipped",
  SHIPPED: "Mark as delivered",
};

export function FulfilmentRecordPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showOverride, setShowOverride] = useState(false);
  const [actionError, setActionError] = useState("");

  const record = useQuery({
    queryKey: ["fulfilment-record", id],
    queryFn: async () => (await api.get(`/fulfilment/${id}`)).data.fulfilment,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["fulfilment-record", id] });
    queryClient.invalidateQueries({ queryKey: ["fulfilment-list"] });
  }

  const consolidate = useMutation({
    mutationFn: async () => api.post(`/fulfilment/${id}/consolidate`),
    onSuccess: () => {
      refresh();
      toast("Backorder consolidated into a shipment");
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const validate = useMutation({
    mutationFn: async () => api.post(`/fulfilment/${id}/validate`),
    onSuccess: (response) => {
      refresh();
      toast(response.data.status === "SHIPPED" ? "Marked as shipped" : "Marked as delivered");
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  if (record.isLoading) return <Spinner label="Loading shipment" />;
  if (record.isError) {
    return <ErrorState message={errorMessage(record.error)} onRetry={record.refetch} />;
  }

  const parcel = record.data;
  const canAct = OPS_ROLES.includes(user.role);
  const validateLabel = VALIDATE_LABEL[parcel.status];

  return (
    <div className="animate-fadeUp">
      <RecordNav
        listLabel="Fulfilment"
        listTo="/fulfilment"
        recordId={parcel.reference}
        neighboursPath={`/fulfilment/${parcel.id}/neighbours`}
        recordTo={(nextId) => `/fulfilment/${nextId}`}
      />

      <PageHeader
        title={parcel.reference}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sand-900">{parcel.warehouse.name}</span>
            <StatusPill tone={FULFILMENT_STATUS_TONES[parcel.status]}>
              {FULFILMENT_STATUS_LABELS[parcel.status]}
            </StatusPill>
            {parcel.isManualOverride && <StatusPill tone="neutral">Set by hand</StatusPill>}
          </span>
        }
        aside={
          <SmartButtons>
            <SmartButton
              count={parcel.source.shipmentCount}
              label="Shipments"
              icon={Truck}
              to={`/fulfilment?quotationId=${parcel.source.quotationId}`}
            />
          </SmartButtons>
        }
        actions={
          canAct && (
            <>
              {parcel.isBackorder && parcel.canConsolidate && (
                <Button
                  icon={PackageCheck}
                  isLoading={consolidate.isPending}
                  onClick={() => consolidate.mutate()}
                >
                  Consolidate
                </Button>
              )}
              {validateLabel && (
                <Button isLoading={validate.isPending} onClick={() => validate.mutate()}>
                  {validateLabel}
                </Button>
              )}
              {!parcel.isBackorder && parcel.status === "SUGGESTED" && (
                <Button variant="secondary" onClick={() => setShowOverride(true)}>
                  Change the split
                </Button>
              )}
            </>
          )
        }
      />

      {parcel.isBackorder && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-state-warnBorder bg-state-warnSoft px-3 py-2 text-sm text-state-warn">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          Waiting on stock. Expected {formatDate(parcel.estDeliveryDate)}
          {parcel.canConsolidate && " — stock has arrived and this can be filled now."}
        </p>
      )}

      {actionError && (
        <p className="mb-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-sm text-state-bad">
          {actionError}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <h2 className="mb-1 text-xl font-semibold text-sand-900">Operations</h2>
          <p className="mb-3 text-sm text-sand-600">What this parcel carries.</p>
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH align="right">Ordered</TH>
                <TH align="right">From this warehouse</TH>
              </TR>
            </THead>
            <TBody>
              {parcel.lines.map((line) => (
                <TR key={line.quotationLineId}>
                  <TD>
                    <span className="font-medium text-sand-900">{line.product}</span>
                    {line.sku && <span className="ml-2 text-xs text-sand-500">{line.sku}</span>}
                  </TD>
                  <TD figure align="right">
                    {line.ordered}
                  </TD>
                  <TD figure align="right">
                    {line.qty}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>

        <Card>
          <h2 className="mb-3 text-xl font-semibold text-sand-900">Details</h2>
          <dl className="space-y-3 text-sm">
            <Detail label="Source document">
              <RecordLink to={`/quotations/${parcel.source.quotationId}`}>
                {parcel.source.number}
              </RecordLink>
            </Detail>
            <Detail label="Customer">
              <RecordLink to={`/customers/${parcel.source.customerId}`}>
                {parcel.source.customer}
              </RecordLink>
            </Detail>
            <Detail label="Warehouse">
              {parcel.warehouse.name}
              <span className="text-sand-500"> · {parcel.warehouse.leadTimeDays} day lead time</span>
            </Detail>
            <Detail label="Scheduled">
              <span className={`figure ${parcel.isLate ? "font-medium text-state-bad" : ""}`}>
                {formatDate(parcel.estDeliveryDate)}
              </span>
            </Detail>
            {parcel.requestedDeliveryDate && (
              <Detail label="Customer asked for">
                <span className="figure">{formatDate(parcel.requestedDeliveryDate)}</span>
              </Detail>
            )}
            <Detail label="Shipping cost">
              <span className="figure">{formatMoney(parcel.shipmentCost)}</span>
            </Detail>
          </dl>

          {parcel.isLate && (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-state-bad">
              <TriangleAlert size={13} />
              Later than the date the customer asked for.
            </p>
          )}
        </Card>
      </div>

      <OverrideModal
        open={showOverride}
        onClose={() => setShowOverride(false)}
        quotationId={parcel.source.quotationId}
        lines={parcel.orderLines}
        onSaved={() => {
          refresh();
          toast("Split saved");
        }}
      />
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
