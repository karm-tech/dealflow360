import { Check } from "lucide-react";
import { StatusPill } from "../../components/ui";
import {
  QUOTATION_STAGES,
  QUOTATION_STATUS_LABELS,
  QUOTATION_STATUS_TONES,
} from "../../lib/constants";

// The whole lifecycle stays visible, with everything reached so far marked, so
// the stage a deal is at reads without opening anything.
export function StatusBar({ status }) {
  const currentIndex = QUOTATION_STAGES.indexOf(status);

  // Cancelled and Under Negotiation are not stages on the normal path.
  if (currentIndex === -1) {
    return (
      <div className="flex items-center gap-2">
        <StatusPill tone={QUOTATION_STATUS_TONES[status]}>
          {QUOTATION_STATUS_LABELS[status]}
        </StatusPill>
      </div>
    );
  }

  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Quotation stage">
      {QUOTATION_STAGES.map((stage, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;

        const tone = isCurrent
          ? "border-ink-700 bg-ink-700 text-white"
          : isDone
            ? "border-ink-200 bg-ink-50 text-ink-700"
            : "border-sand-200 bg-sand-50 text-sand-500";

        return (
          <li key={stage} className="flex items-center gap-1">
            <span
              aria-current={isCurrent ? "step" : undefined}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium ${tone}`}
            >
              {isDone && <Check className="h-3 w-3" aria-hidden="true" />}
              {QUOTATION_STATUS_LABELS[stage]}
            </span>
            {index < QUOTATION_STAGES.length - 1 && (
              <span aria-hidden="true" className="text-sand-400">
                ›
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
