// Warehouses, and the only way stock goes up.
//
// A quantity is never typed over. Stock arrives through a receipt that records
// who added what and when, so the number on screen always has an event behind
// it — and receiving is what makes a waiting backorder fillable, so the receipt
// reports which deals it just unblocked.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PackagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
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

const BLANK = {
  name: "",
  code: "",
  city: "",
  shippingWeight: "1",
  leadTimeDays: "2",
  isActive: "true",
};

function WarehouseDialog({ open, warehouse, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");

  const isEdit = Boolean(warehouse);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(
      warehouse
        ? {
            name: warehouse.name,
            code: warehouse.code,
            city: warehouse.city || "",
            shippingWeight: String(warehouse.shippingWeight),
            leadTimeDays: String(warehouse.leadTimeDays),
            isActive: warehouse.isActive ? "true" : "false",
          }
        : BLANK,
    );
  }, [open, warehouse]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        city: form.city.trim(),
        shippingWeight: Number(form.shippingWeight),
        leadTimeDays: Number(form.leadTimeDays),
        isActive: form.isActive === "true",
      };

      return isEdit
        ? api.patch(`/config/warehouses/${warehouse.id}`, body)
        : api.post("/config/warehouses", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-warehouses"] });
      toast(isEdit ? `${form.name} updated` : `${form.name} added`);
      onClose();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${warehouse.name}` : "New warehouse"}
      description="The shipment split prefers cheaper warehouses and fewer parcels."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={save.isPending}
            disabled={!form.name.trim() || !form.code.trim()}
            onClick={() => save.mutate()}
          >
            {isEdit ? "Save" : "Add warehouse"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="wh-name" tooltip="Shown on the fulfilment split and on stock receipts.">
          <Input
            id="wh-name"
            autoFocus
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder="Pune Warehouse"
          />
        </Field>

        <Field label="Code" htmlFor="wh-code" hint="Capitals, digits and hyphens." tooltip="Short unique code used on allocations. Cannot clash with another warehouse.">
          <Input
            id="wh-code"
            value={form.code}
            onChange={(event) => set("code", event.target.value.toUpperCase())}
            placeholder="WH-PUNE"
          />
        </Field>

        <Field label="City" htmlFor="wh-city" tooltip="Used when explaining a split. Does not auto-route by customer city.">
          <Input
            id="wh-city"
            value={form.city}
            onChange={(event) => set("city", event.target.value)}
          />
        </Field>

        <Field label="Status" htmlFor="wh-active" hint="An inactive warehouse is left out of the split." tooltip="Inactive stock is kept but never chosen for a new allocation.">
          <Select
            id="wh-active"
            value={form.isActive}
            onChange={(event) => set("isActive", event.target.value)}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </Field>

        <Field
          label="Shipping weight"
          htmlFor="wh-weight"
          hint="Relative cost to ship from here. Lower is preferred."
          tooltip="A ratio, not rupees. The split prefers a lower weight when stock allows."
        >
          <Input
            id="wh-weight"
            type="number"
            min={0.1}
            step="0.1"
            value={form.shippingWeight}
            onChange={(event) => set("shippingWeight", event.target.value)}
          />
        </Field>

        <Field label="Lead time (days)" htmlFor="wh-lead" hint="Dispatch to arrival, sets the estimate." tooltip="The estimated delivery date uses the slowest warehouse in the split.">
          <Input
            id="wh-lead"
            type="number"
            min={0}
            value={form.leadTimeDays}
            onChange={(event) => set("leadTimeDays", event.target.value)}
          />
        </Field>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
          {error}
        </p>
      )}
    </Modal>
  );
}

function ReceiveDialog({ open, warehouses, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ warehouseId: "", productId: "", qty: "" });
  const [error, setError] = useState("");
  const [unblocked, setUnblocked] = useState([]);

  const products = useQuery({
    queryKey: ["stockable-products"],
    queryFn: async () => (await api.get("/catalogue/products")).data.products,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setError("");
    setUnblocked([]);
    setForm({ warehouseId: "", productId: "", qty: "" });
  }, [open]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const receive = useMutation({
    mutationFn: () =>
      api.post("/fulfilment/stock/receive", {
        warehouseId: Number(form.warehouseId),
        productId: Number(form.productId),
        qty: Number(form.qty),
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["config-warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast(response.data.message);

      // Receiving stock can make a waiting backorder fillable, so the deals it
      // just unblocked are named rather than left to be discovered.
      setUnblocked(response.data.consolidatable || []);
      if ((response.data.consolidatable || []).length === 0) onClose();
      else setForm((current) => ({ ...current, qty: "" }));
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  // Only stocked goods can be received; a service has nothing to count.
  const stockable = (products.data || []).filter((product) => product.isStockable);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Receive stock"
      description="Recorded as a receipt against your name, not typed over the quantity."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            isLoading={receive.isPending}
            disabled={!form.warehouseId || !form.productId || !form.qty}
            onClick={() => receive.mutate()}
          >
            Receive
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field label="Product" htmlFor="receive-product" tooltip="Stockable products only. Services never have a quantity to receive.">
            <Select
              id="receive-product"
              value={form.productId}
              onChange={(event) => set("productId", event.target.value)}
            >
              <option value="">Choose a product…</option>
              {stockable.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Quantity" htmlFor="receive-qty" tooltip="Added to on-hand stock in the warehouse chosen below.">
          <Input
            id="receive-qty"
            type="number"
            min={1}
            value={form.qty}
            onChange={(event) => set("qty", event.target.value)}
          />
        </Field>

        <div className="sm:col-span-3">
          <Field label="Into" htmlFor="receive-warehouse" tooltip="Where the units land. An inactive warehouse can still receive stock.">
            <Select
              id="receive-warehouse"
              value={form.warehouseId}
              onChange={(event) => set("warehouseId", event.target.value)}
            >
              <option value="">Choose a warehouse…</option>
              {warehouses
                .filter((warehouse) => warehouse.isActive)
                .map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      </div>

      {unblocked.length > 0 && (
        <div className="mt-4 rounded-lg border border-state-okBorder bg-state-okSoft p-3">
          <p className="text-base font-medium text-state-ok">
            {unblocked.length === 1
              ? "One backorder can now be filled"
              : `${unblocked.length} backorders can now be filled`}
          </p>
          <ul className="mt-2 space-y-1">
            {unblocked.map((row) => (
              <li key={row.id}>
                <Link
                  to={`/quotations/${row.quotationId}`}
                  className="text-sm font-medium text-ink-700 underline underline-offset-2 hover:text-ink-800"
                >
                  {row.number}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
          {error}
        </p>
      )}
    </Modal>
  );
}

export function WarehousesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState(null);
  const [isReceiving, setIsReceiving] = useState(false);

  const warehouses = useQuery({
    queryKey: ["config-warehouses"],
    queryFn: async () => (await api.get("/config/warehouses")).data.warehouses,
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/config/warehouses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-warehouses"] });
      toast("Warehouse deleted");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  if (warehouses.isLoading) return <Spinner label="Loading warehouses" />;
  if (warehouses.isError) {
    return <ErrorState message={errorMessage(warehouses.error)} onRetry={warehouses.refetch} />;
  }

  const lowStock = warehouses.data.flatMap((warehouse) =>
    warehouse.lowStock.map((row) => ({ ...row, warehouse: warehouse.name })),
  );

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Warehouses"
        subtitle="Where stock sits, and what it costs to ship from each."
        actions={
          <>
            <Button variant="secondary" icon={PackagePlus} onClick={() => setIsReceiving(true)}>
              Receive stock
            </Button>
            <Button icon={Plus} onClick={() => setDialog({})}>
              New warehouse
            </Button>
          </>
        }
      />

      <Card padded={false}>
        <Table>
          <THead>
            <TR>
              <TH>Warehouse</TH>
              <TH>City</TH>
              <TH align="right">Ship weight</TH>
              <TH align="right">Lead time</TH>
              <TH align="right">On hand</TH>
              <TH align="right">Shipments</TH>
              <TH>Status</TH>
              <TH align="right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {warehouses.data.map((warehouse) => (
              <TR key={warehouse.id}>
                <TD>
                  <span className="font-medium text-sand-900">{warehouse.name}</span>
                  <span className="ml-2 font-mono text-sm text-sand-500">{warehouse.code}</span>
                </TD>
                <TD>{warehouse.city || "—"}</TD>
                <TD figure align="right">
                  {warehouse.shippingWeight}
                </TD>
                <TD figure align="right">
                  {warehouse.leadTimeDays} days
                </TD>
                <TD figure align="right">
                  {warehouse.unitsOnHand}
                  <span className="ml-1 text-sm text-sand-500">
                    over {warehouse.lineCount} {warehouse.lineCount === 1 ? "line" : "lines"}
                  </span>
                </TD>
                <TD figure align="right">
                  {warehouse.shipmentCount}
                </TD>
                <TD>
                  <StatusPill tone={warehouse.isActive ? "ok" : "neutral"}>
                    {warehouse.isActive ? "Active" : "Inactive"}
                  </StatusPill>
                </TD>
                <TD align="right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Pencil}
                      onClick={() => setDialog(warehouse)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      onClick={() => remove.mutate(warehouse.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {lowStock.length > 0 && (
        <Card className="mt-5" padded={false}>
          <div className="p-6">
            <CardHeader
              title="At or below the reorder level"
              subtitle="These are the lines a new quotation is most likely to run short on."
              actions={
                <Button size="sm" variant="secondary" icon={PackagePlus} onClick={() => setIsReceiving(true)}>
                  Receive stock
                </Button>
              }
            />
          </div>

          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>Warehouse</TH>
                <TH align="right">On hand</TH>
                <TH align="right">Reorder at</TH>
              </TR>
            </THead>
            <TBody>
              {lowStock.map((row) => (
                <TR key={`${row.warehouse}-${row.productId}`}>
                  <TD>
                    {row.productName}
                    <Badge className="ml-2">{row.sku}</Badge>
                  </TD>
                  <TD>{row.warehouse}</TD>
                  <TD figure align="right">
                    {row.qty}
                  </TD>
                  <TD figure align="right">
                    {row.reorderLevel}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <WarehouseDialog
        open={Boolean(dialog)}
        warehouse={dialog?.id ? dialog : null}
        onClose={() => setDialog(null)}
      />
      <ReceiveDialog
        open={isReceiving}
        warehouses={warehouses.data}
        onClose={() => setIsReceiving(false)}
      />
    </div>
  );
}
