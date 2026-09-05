import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Field, Input, Modal, Spinner } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";

// Sets the quantity per warehouse by hand. What is typed here is checked
// against real stock on the server before anything is written.
export function OverrideModal({ open, onClose, quotationId, lines, onSaved }) {
  const [amounts, setAmounts] = useState({});
  const [error, setError] = useState("");

  const stock = useQuery({
    queryKey: ["stock"],
    queryFn: async () => (await api.get("/fulfilment/stock")).data.warehouses,
    enabled: open,
  });

  const stockableLines = lines || [];

  useEffect(() => {
    if (open) {
      setAmounts({});
      setError("");
    }
  }, [open]);

  const save = useMutation({
    mutationFn: async (allocations) =>
      api.post(`/fulfilment/quotation/${quotationId}/override`, { allocations }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  function key(lineId, warehouseId) {
    return `${lineId}:${warehouseId}`;
  }

  function submit() {
    setError("");

    const allocations = [];
    for (const line of stockableLines) {
      for (const warehouse of stock.data || []) {
        const raw = amounts[key(line.id, warehouse.id)];
        const qty = Number(raw || 0);
        if (qty > 0) {
          allocations.push({ quotationLineId: line.id, warehouseId: warehouse.id, qty });
        }
      }
    }

    save.mutate(allocations);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Set the split by hand"
      description="Anything left unallocated goes to backorder."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={save.isPending}>
            Save split
          </Button>
        </>
      }
    >
      {stock.isLoading ? (
        <Spinner label="Loading stock" />
      ) : (
        <div className="space-y-4">
          {stockableLines.map((line) => (
            <div key={line.id}>
              <p className="text-sm font-medium text-sand-900">
                {line.productName} <span className="figure text-sand-500">· order {line.qty}</span>
              </p>

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(stock.data || []).map((warehouse) => {
                  const row = warehouse.stock.find((entry) => entry.productId === line.productId);
                  const have = row ? row.qty : 0;

                  return (
                    <Field
                      key={warehouse.id}
                      label={warehouse.name}
                      hint={`${have} in stock · ${warehouse.leadTimeDays}d lead time`}
                    >
                      <Input
                        type="number"
                        min={0}
                        max={Math.min(have, line.qty)}
                        value={amounts[key(line.id, warehouse.id)] ?? ""}
                        onChange={(event) =>
                          setAmounts((current) => ({
                            ...current,
                            [key(line.id, warehouse.id)]: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  );
                })}
              </div>
            </div>
          ))}

          {stockableLines.length === 0 && (
            <p className="text-sm text-sand-600">Nothing on this order is stocked.</p>
          )}

          {error && <p className="text-sm text-state-bad">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
