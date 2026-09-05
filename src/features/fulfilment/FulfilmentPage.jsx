import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PackagePlus, TriangleAlert } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Button,
  EmptyState,
  ErrorState,
  Spinner,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import { FULFILMENT_STATUS_LABELS, FULFILMENT_STATUS_TONES, ROLES } from "../../lib/constants";
import { useAuth } from "../../app/AuthProvider";
import { StockReceiptModal } from "./StockReceiptModal";

export function FulfilmentPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showReceipt, setShowReceipt] = useState(false);

  const fulfilment = useQuery({
    queryKey: ["fulfilment-list"],
    queryFn: async () => (await api.get("/fulfilment")).data,
  });

  if (fulfilment.isLoading) return <Spinner label="Loading fulfilment" />;
  if (fulfilment.isError) {
    return <ErrorState message={errorMessage(fulfilment.error)} onRetry={fulfilment.refetch} />;
  }

  const { parcels, consolidatableIds } = fulfilment.data;
  const ready = new Set(consolidatableIds);

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Fulfilment"
        subtitle="Shipments and backorders across every approved order."
        actions={
          user.role === ROLES.ADMIN && (
            <Button variant="secondary" size="sm" onClick={() => setShowReceipt(true)}>
              <PackagePlus size={14} /> Receive stock
            </Button>
          )
        }
      />

      {parcels.length === 0 ? (
        <EmptyState
          title="Nothing waiting to ship"
          hint="A shipment appears here once a quotation is approved and its stock is allocated."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Order</TH>
              <TH>Customer</TH>
              <TH>Warehouse</TH>
              <TH>Contents</TH>
              <TH>Status</TH>
              <TH align="right">Cost</TH>
              <TH align="right">Delivery</TH>
            </TR>
          </THead>
          <TBody>
            {parcels.map((parcel) => (
              <TR key={parcel.id} onClick={() => navigate(`/quotations/${parcel.quotationId}`)}>
                <TD>{parcel.number}</TD>
                <TD>{parcel.customer}</TD>
                <TD>{parcel.warehouse}</TD>
                <TD>
                  {parcel.lines.map((line) => `${line.product} ×${line.qty}`).join(", ")}
                </TD>
                <TD>
                  <div className="flex items-center gap-1.5">
                    <StatusPill tone={FULFILMENT_STATUS_TONES[parcel.status]}>
                      {FULFILMENT_STATUS_LABELS[parcel.status]}
                    </StatusPill>
                    {ready.has(parcel.id) && <StatusPill tone="ok">Stock in</StatusPill>}
                  </div>
                </TD>
                <TD figure align="right">
                  {formatMoney(parcel.shipmentCost)}
                </TD>
                <TD align="right">
                  <span className={`figure ${parcel.isLate ? "font-medium text-state-bad" : ""}`}>
                    {formatDate(parcel.estDeliveryDate)}
                  </span>
                  {parcel.isLate && (
                    <span className="ml-1 inline-flex text-state-bad" title="Later than promised">
                      <TriangleAlert size={12} />
                    </span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <StockReceiptModal
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        onSaved={() => fulfilment.refetch()}
      />
    </div>
  );
}
