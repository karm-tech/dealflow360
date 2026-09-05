import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, Send, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Textarea,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { lineKey, useBasket } from "./BasketProvider";

function Line({ item, onQty, onRemove }) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-sand-200 px-4 py-3 last:border-0">
      <div className="min-w-40 flex-1">
        <p className="text-base font-medium text-sand-900">{item.name}</p>
        <p className="figure mt-0.5 text-xs text-sand-600">
          {item.sku}
          {item.variantLabel ? ` · ${item.variantLabel}` : ""} · {formatMoney(item.price)} per {item.unit}
        </p>
      </div>

      {item.billingType === "RECURRING" && (
        <Badge className="gap-1 font-normal">
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          {item.planName || "Recurring"}
        </Badge>
      )}

      <input
        type="number"
        min={1}
        value={item.qty}
        aria-label={`Quantity of ${item.name}`}
        onChange={(event) => onQty(item.key, Math.max(1, Number(event.target.value) || 1))}
        className="figure w-16 rounded-lg border border-sand-300 px-2 py-1.5 text-right text-sm focus:border-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-100"
      />

      <p className="figure w-28 text-right text-base text-sand-900">
        {formatMoney(item.price * item.qty)}
      </p>

      <Button
        variant="ghost"
        size="sm"
        icon={Trash2}
        aria-label={`Remove ${item.name}`}
        onClick={() => onRemove(item.key)}
      />
    </li>
  );
}

export function PortalRequestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { items, setQty, remove, clear } = useBasket();

  const [notes, setNotes] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      api.post("/portal/requests", {
        lines: items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId || undefined,
          qty: item.qty,
        })),
        notes: notes.trim() || undefined,
      }),
    onSuccess: (response) => {
      clear();
      queryClient.invalidateQueries({ queryKey: ["portal-quotations"] });
      toast(`Request ${response.data.number} sent. We will come back to you shortly.`);
      navigate(`/portal/quotations/${response.data.id}`);
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  // An estimate, and labelled as one. The quotation is priced by a person who
  // may apply a discount or add delivery, so this figure is not a promise.
  const estimate = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <div className="animate-fadeUp">
      <Button
        variant="ghost"
        size="sm"
        icon={ArrowLeft}
        className="mb-3 -ml-2.5"
        onClick={() => navigate("/portal")}
      >
        Back to the catalogue
      </Button>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-sand-900">Request a quotation</h1>
        <p className="mt-1 text-base text-sand-600">
          Check the quantities, tell us anything we should know, and send it over.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          hint="Add products from the catalogue and they will appear here."
          action={<Button onClick={() => navigate("/portal")}>Browse the catalogue</Button>}
        />
      ) : (
        <>
          <ul className="rounded-xl border border-sand-200 bg-surface shadow-card">
            {items.map((item) => (
              <Line key={lineKey(item)} item={{ ...item, key: lineKey(item) }} onQty={setQty} onRemove={remove} />
            ))}
          </ul>

          <div className="mt-3 flex justify-end">
            <p className="text-sm text-sand-600">
              Rough total{" "}
              <span className="figure text-base font-semibold text-sand-900">
                {formatMoney(estimate)}
              </span>
              <span className="block text-right text-xs text-sand-500">
                before tax, delivery and any discount we apply
              </span>
            </p>
          </div>

          <Card className="mt-6">
            <Field
              label="Anything we should know?"
              htmlFor="portal-notes"
              hint="Delivery dates, site details, a budget to work to — whatever helps us quote properly."
              tooltip="Attached to the draft the rep picks up. It does not set a price or a discount."
            >
              <Textarea
                id="portal-notes"
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="We need these before the end of the month, delivered to our Ahmedabad office."
              />
            </Field>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={clear}>
                Empty this
              </Button>
              <Button icon={Send} isLoading={submit.isPending} onClick={() => submit.mutate()}>
                Send this request
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
