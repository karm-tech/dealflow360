import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Field, Modal, Textarea } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";

// Ending a subscription early credits back the days already paid for but not
// used. The credit note is worked out by the server against the invoice that
// actually covered them.
export function CancelSubscriptionModal({ open, onClose, subscription, onSaved }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
      setError("");
    }
  }, [open]);

  const cancel = useMutation({
    mutationFn: async () =>
      api.post(`/billing/subscriptions/${subscription.id}/cancel`, { reason: reason || null }),
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
      title={`Cancel ${subscription.reference}?`}
      description="Nothing after today is billed. The rest of the order carries on."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep it running
          </Button>
          <Button variant="danger" isLoading={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel subscription
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-base text-sand-700">
          {subscription.product} · {subscription.customer?.name}
        </p>
        <p className="rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-sm text-sand-700">
          Days already invoiced but not used are credited back. Periods still scheduled have taken no
          money, so there is nothing to return on those.
        </p>

        <Field label="Reason" htmlFor="reason" hint="Kept on the order's history." tooltip="Written on the order timeline. Unused prepaid days are credited.">
          <Textarea
            id="reason"
            value={reason}
            placeholder="Why is it ending?"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-state-bad">{error}</p>}
      </div>
    </Modal>
  );
}
