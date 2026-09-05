import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Field, Input, Modal, Select } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "../../lib/constants";

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Recording money against an invoice. The status that follows is worked out by
// the server from the payments on the invoice, so nothing here sets it.
export function PaymentModal({ open, onClose, invoice, onSaved }) {
  const [method, setMethod] = useState("BANK");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(today());
  const [error, setError] = useState("");

  // Settling in full is the common case, so the outstanding amount is offered.
  useEffect(() => {
    if (open) {
      setMethod("BANK");
      setAmount(String(invoice.outstanding));
      setReference("");
      setPaidAt(today());
      setError("");
    }
  }, [open, invoice.outstanding]);

  const record = useMutation({
    mutationFn: async () =>
      api.post(`/billing/invoices/${invoice.id}/payments`, {
        method,
        amount: Number(amount),
        reference: reference || null,
        paidAt,
      }),
    onSuccess: (response) => {
      onSaved(response.data);
      onClose();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Record a payment on ${invoice.number}`}
      description={`${formatMoney(invoice.outstanding)} outstanding of ${formatMoney(invoice.total)}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={record.isPending}
            disabled={!amount || Number(amount) <= 0}
            onClick={() => {
              setError("");
              record.mutate();
            }}
          >
            Record payment
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Method" htmlFor="method">
          <Select id="method" value={method} onChange={(event) => setMethod(event.target.value)}>
            {PAYMENT_METHODS.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_METHOD_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Amount"
          htmlFor="amount"
          hint="Less than the outstanding amount leaves the invoice part paid."
        >
          <Input
            id="amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>

        <Field label="Reference" htmlFor="reference" hint="Transaction or cheque number, if there is one.">
          <Input
            id="reference"
            value={reference}
            placeholder="Optional"
            onChange={(event) => setReference(event.target.value)}
          />
        </Field>

        <Field label="Received on" htmlFor="paidAt">
          <Input
            id="paidAt"
            type="date"
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-state-bad">{error}</p>}
      </div>
    </Modal>
  );
}
