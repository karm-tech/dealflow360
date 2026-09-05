import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageCheck, TriangleAlert, Warehouse } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Spinner,
  StatusPill,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import { FULFILMENT_STATUS_LABELS, FULFILMENT_STATUS_TONES } from "../../lib/constants";
import { OverrideModal } from "./OverrideModal";

export function FulfilmentPanel({ quotation }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showOverride, setShowOverride] = useState(false);
  const [actionError, setActionError] = useState("");

  const fulfilment = useQuery({
    queryKey: ["fulfilment", quotation.id],
    queryFn: async () => (await api.get(`/fulfilment/quotation/${quotation.id}`)).data.fulfilment,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["fulfilment", quotation.id] });
    queryClient.invalidateQueries({ queryKey: ["quotation", String(quotation.id)] });
  }

  const suggest = useMutation({
    mutationFn: async () => api.post(`/fulfilment/quotation/${quotation.id}/suggest`),
    onSuccess: () => {
      refresh();
      toast("Split worked out from current stock");
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const consolidate = useMutation({
    mutationFn: async (id) => api.post(`/fulfilment/${id}/consolidate`),
    onSuccess: () => {
      refresh();
      toast("Backorder consolidated into a shipment");
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  if (fulfilment.isLoading) return <Spinner label="Loading fulfilment" />;
  if (fulfilment.isError) {
    return <ErrorState message={errorMessage(fulfilment.error)} onRetry={fulfilment.refetch} />;
  }

  const view = fulfilment.data;
  const parcels = view.parcels;

  return (
    <Card padded={false}>
      <CardHeader
        title="Fulfilment"
        subtitle={
          view.isExecuted
            ? "Stock has been allocated to this order."
            : "Suggested split. Nothing is reserved until the order is agreed."
        }
      />

      {parcels.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="Nothing to ship"
            hint="Only stocked products are allocated to a warehouse. Services and subscriptions skip fulfilment."
          />
          {!view.isExecuted && (
            <div className="mt-3">
              <Button size="sm" variant="secondary" onClick={() => suggest.mutate()} isLoading={suggest.isPending}>
                Work out the split
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="divide-y divide-sand-200">
            {parcels.map((parcel) => (
              <div key={parcel.id} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5 text-sand-400">
                  {parcel.status === "BACKORDER" ? (
                    <TriangleAlert size={16} />
                  ) : (
                    <Warehouse size={16} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sand-900">{parcel.warehouse}</span>
                    <StatusPill tone={FULFILMENT_STATUS_TONES[parcel.status]}>
                      {FULFILMENT_STATUS_LABELS[parcel.status]}
                    </StatusPill>
                    {parcel.isManualOverride && <StatusPill tone="neutral">Set by hand</StatusPill>}
                  </div>

                  <ul className="mt-1 text-sm text-sand-600">
                    {parcel.lines.map((line) => (
                      <li key={line.quotationLineId}>
                        {line.product} <span className="figure">×{line.qty}</span>
                      </li>
                    ))}
                  </ul>

                  {parcel.canConsolidate && parcel.status === "BACKORDER" && (
                    <div className="mt-2">
                      <Button
                        size="sm"
                        onClick={() => consolidate.mutate(parcel.id)}
                        isLoading={consolidate.isPending}
                      >
                        <PackageCheck size={14} /> Consolidate remaining backorder
                      </Button>
                      <p className="mt-1 text-xs text-sand-500">Stock has arrived and can cover this.</p>
                    </div>
                  )}
                </div>

                <div className="text-right text-sm">
                  <div className="figure text-sand-800">{formatMoney(parcel.shipmentCost)}</div>
                  <div className="text-xs text-sand-500">{formatDate(parcel.estDeliveryDate)}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-sand-200 bg-sand-50 px-4 py-3 text-sm">
            <Row label="Shipments" value={String(view.shipmentCount)} />
            {view.backorderCount > 0 && (
              <Row label="On backorder" value={String(view.backorderCount)} />
            )}
            <Row label="Shipping cost" value={formatMoney(view.totalShippingCost)} />
            <Row
              label="Estimated delivery"
              value={formatDate(view.estimatedDeliveryDate)}
              tone={view.isLate ? "bad" : undefined}
            />
            {view.requestedDeliveryDate && (
              <Row label="Requested" value={formatDate(view.requestedDeliveryDate)} />
            )}

            {view.isLate && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-state-bad">
                <TriangleAlert size={13} />
                Running later than the date the customer asked for.
              </p>
            )}
          </div>
        </>
      )}

      {!view.isExecuted && parcels.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-sand-200 px-4 py-3">
          <Button size="sm" variant="secondary" onClick={() => suggest.mutate()} isLoading={suggest.isPending}>
            Accept suggested split
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowOverride(true)}>
            Manual override
          </Button>
        </div>
      )}

      {actionError && <p className="px-4 pb-3 text-sm text-state-bad">{actionError}</p>}

      <OverrideModal
        open={showOverride}
        onClose={() => setShowOverride(false)}
        quotation={quotation}
        onSaved={() => {
          refresh();
          toast("Split saved");
        }}
      />
    </Card>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-sand-600">{label}</span>
      <span className={`figure ${tone === "bad" ? "font-medium text-state-bad" : "text-sand-900"}`}>
        {value}
      </span>
    </div>
  );
}
