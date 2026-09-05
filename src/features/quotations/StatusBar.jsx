import { Check } from "lucide-react";
import { StatusPill } from "../../components/ui";
import {
  QUOTATION_STAGES,
  QUOTATION_STATUS_LABELS,
  QUOTATION_STATUS_TONES,
} from "../../lib/constants";

// The whole lifecycle as a track, not a row of tags: what is done, where the
// deal is now, and what is still ahead.
export function StatusBar({ status }) {
  const currentIndex = QUOTATION_STAGES.indexOf(status);

  // Cancelled and Under Negotiation are not stages on the normal path.
  if (currentIndex === -1) {
    return (
      <StatusPill tone={QUOTATION_STATUS_TONES[status]}>
        {QUOTATION_STATUS_LABELS[status]}
      </StatusPill>
    );
  }

  return (
    <ol
      aria-label="Quotation stage"
      className="flex w-full flex-wrap items-stretch overflow-hidden rounded-xl border border-sand-200 bg-surface"
    >
      {QUOTATION_STAGES.map((stage, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;

        const tone = isCurrent
          ? "bg-ink-700 text-white"
          : isDone
            ? "bg-ink-50 text-ink-700"
            : "bg-surface text-sand-500";

        return (
          <li
            key={stage}
            aria-current={isCurrent ? "step" : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 border-r border-sand-200 px-3 py-2.5 text-center text-sm last:border-r-0 ${tone} ${
              isCurrent ? "font-semibold" : "font-medium"
            }`}
          >
            {isDone && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {QUOTATION_STATUS_LABELS[stage]}
          </li>
        );
      })}
    </ol>
  );
}
