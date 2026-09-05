import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Field, Input, Modal, Select, Spinner, useToast } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";

// Receiving stock is what clears a backorder, so the result says which orders
// can now be consolidated.
export function StockReceiptModal({ open, onClose, onSaved }) {
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState("");
  const toast = useToast();
  const [covered, setCovered] = useState([]);

  const stock = useQuery({
    queryKey: ["stock"],
    queryFn: async () => (await api.get("/fulfilment/stock")).data.warehouses,
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setError("");
      setCovered([]);
      setQty("");
    }
  }, [open]);

  const receive = useMutation({
    mutationFn: async () =>
      (
        await api.post("/fulfilment/stock/receive", {
          warehouseId: Number(warehouseId),
          productId: Number(productId),
          qty: Number(qty),
        })
      ).data,
    onSuccess: (data) => {
      setCovered(data.consolidatable);
      setQty("");
      toast(data.message || "Stock received");
      onSaved();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const warehouses = stock.data || [];
  const selected = warehouses.find((warehouse) => String(warehouse.id) === String(warehouseId));
  const products = selected ? selected.stock : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Receive stock"
      description="Adds stock to a warehouse and clears any backorder it can cover."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={() => {
              setError("");
              receive.mutate();
            }}
            isLoading={receive.isPending}
          >
            Receive
          </Button>
        </>
      }
    >
      {stock.isLoading ? (
        <Spinner label="Loading warehouses" />
      ) : (
        <div className="space-y-3">
          <Field label="Warehouse">
            <Select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
              <option value="">Choose a warehouse</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Product">
            <Select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              disabled={!selected}
            >
              <option value="">Choose a product</option>
              {products.map((row) => (
                <option key={row.productId} value={row.productId}>
                  {row.product} — {row.qty} in stock
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Quantity received">
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={(event) => setQty(event.target.value)}
            />
          </Field>

          {error && <p className="text-sm text-state-bad">{error}</p>}

          {covered.length > 0 && (
            <div className="rounded-lg border border-state-okBorder bg-state-okSoft p-3 text-sm">
              <p className="font-medium text-state-ok">Backorders that can now be filled</p>
              <ul className="mt-1 text-sand-700">
                {covered.map((row) => (
                  <li key={row.id}>{row.number}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-sand-600">
                Open the order to consolidate the remaining backorder.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
