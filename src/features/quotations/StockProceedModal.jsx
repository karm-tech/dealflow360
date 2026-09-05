import { TriangleAlert } from "lucide-react";
import { Button, Modal } from "../../components/ui";

// A shortage warns rather than blocks: once the split runs, whatever no
// warehouse can cover becomes a backorder. So every action that moves the
// quotation on asks first, and keeps asking while a line is still short.
export function StockProceedModal({
  open,
  lines,
  actionLabel = "Yes, proceed",
  onClose,
  onProceed,
}) {
  const rows = lines || [];

  return (
    <Modal
      open={open && rows.length > 0}
      onClose={onClose}
      title={rows.length === 1 ? "This product is not available" : "These products are not available"}
      description="There is not enough on hand to cover every line. Proceeding puts the shortfall on backorder."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            No, go back
          </Button>
          <Button onClick={onProceed}>{actionLabel}</Button>
        </>
      }
    >
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.lineId}
            className="flex items-start gap-2 rounded-lg border border-state-warnBorder bg-state-warnSoft px-3 py-2"
          >
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-state-warn"
              aria-hidden="true"
            />
            <div>
              <p className="text-base font-medium text-sand-900">{row.productName}</p>
              <p className="figure text-sm text-sand-700">
                {row.qty} asked · {row.onHand} on hand · short by {row.shortBy}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
