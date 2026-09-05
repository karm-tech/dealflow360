import { Plus, Sparkles, X } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "../../components/ui";
import { formatMoney } from "../../lib/format";
import { BILLING_TYPE_LABELS } from "../../lib/constants";

// Suggestions arrive already filtered and ranked by the server. Relevance
// decides who is listed here at all; promotion only affects the order.
export function UpsellPanel({ suggestions, isEditable, isBusy, onAdd, onDismiss }) {
  return (
    <Card padded={false}>
      <div className="flex items-center gap-2 border-b border-sand-200 px-5 py-3.5">
        <Sparkles className="h-4 w-4 text-ink-700" aria-hidden="true" />
        <h2 className="text-xl font-semibold text-sand-900">Suggestions</h2>
      </div>

      {suggestions.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title="Nothing to suggest yet"
            hint="Add a product and anything customers usually buy alongside it appears here."
          />
        </div>
      ) : (
        <ul className="divide-y divide-sand-200">
          {suggestions.map((item) => (
            <li key={item.productId} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-sand-900">{item.name}</p>
                  <p className="mt-0.5 text-xs text-sand-600">
                    {formatMoney(item.unitPrice)} · {BILLING_TYPE_LABELS[item.billingType]}
                  </p>
                </div>
                {item.isPromoted && <Badge>Promoted</Badge>}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className={item.marginDeltaPoints >= 0 ? "text-state-ok" : "text-state-bad"}>
                  margin {item.marginDeltaPoints >= 0 ? "+" : ""}
                  {item.marginDeltaPoints}pp
                </span>
                <span className="text-sand-500">
                  bought with this in {item.affinityPct}% of past orders
                </span>
              </div>

              {isEditable && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" icon={Plus} disabled={isBusy} onClick={() => onAdd(item)}>
                    Add to quote
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={X}
                    disabled={isBusy}
                    onClick={() => onDismiss(item)}
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
