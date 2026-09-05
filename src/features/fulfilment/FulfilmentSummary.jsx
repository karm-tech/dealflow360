import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Spinner,
  StatusPill,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import { FULFILMENT_STATUS_LABELS, FULFILMENT_STATUS_TONES, ROLES } from "../../lib/constants";
import { useAuth } from "../../app/AuthProvider";

// What a salesperson needs to know about delivery: how many parcels, when it
// lands, and whether that misses the date the customer asked for. The parcels
// themselves are documents of their own, so operations happen there.
export function FulfilmentSummary({ quotation }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();

  const fulfilment = useQuery({
    queryKey: ["fulfilment", quotation.id],
    queryFn: async () => (await api.get(`/fulfilment/quotation/${quotation.id}`)).data.fulfilment,
  });

  const suggest = useMutation({
    mutationFn: async () => api.post(`/fulfilment/quotation/${quotation.id}/suggest`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fulfilment", quotation.id] });
      queryClient.invalidateQueries({ queryKey: ["quotation", String(quotation.id)] });
      toast("Split worked out from current stock");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  if (fulfilment.isLoading) return <Spinner label="Loading fulfilment" />;
  if (fulfilment.isError) {
    return <ErrorState message={errorMessage(fulfilment.error)} onRetry={fulfilment.refetch} />;
  }

  const view = fulfilment.data;

  if (view.parcels.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nothing to ship"
          hint="Only stocked products are allocated to a warehouse. Services and subscriptions skip fulfilment."
        />
        {[ROLES.ADMIN, ROLES.FINANCE].includes(user.role) && (
          <div className="mt-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => suggest.mutate()}
              isLoading={suggest.isPending}
            >
              Work out the split
            </Button>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold text-sand-900">Delivery</h2>
        <Link
          to={`/fulfilment?quotationId=${quotation.id}`}
          className="text-sm font-medium text-ink-700 hover:underline"
        >
          {view.parcels.length} shipment{view.parcels.length === 1 ? "" : "s"}
        </Link>
      </div>

      <ul className="mb-3 space-y-1.5">
        {view.parcels.map((parcel) => (
          <li key={parcel.id} className="flex items-center justify-between gap-3 text-sm">
            <Link to={`/fulfilment/${parcel.id}`} className="text-ink-700 hover:underline">
              {parcel.warehouse}
            </Link>
            <StatusPill tone={FULFILMENT_STATUS_TONES[parcel.status]}>
              {FULFILMENT_STATUS_LABELS[parcel.status]}
            </StatusPill>
          </li>
        ))}
      </ul>

      <dl className="space-y-1 border-t border-sand-200 pt-3 text-sm">
        <Row label="Shipping cost" value={formatMoney(view.totalShippingCost)} />
        <Row
          label="Estimated delivery"
          value={formatDate(view.estimatedDeliveryDate)}
          tone={view.isLate ? "bad" : undefined}
        />
        {view.requestedDeliveryDate && (
          <Row label="Customer asked for" value={formatDate(view.requestedDeliveryDate)} />
        )}
      </dl>

      {view.isLate && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-state-bad">
          <TriangleAlert size={13} />
          Running later than the date the customer asked for.
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
