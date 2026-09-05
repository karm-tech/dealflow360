import { AlertTriangle, ShieldCheck, Ban } from "lucide-react";
import { formatMoney } from "../../lib/format";
import { ROLE_LABELS } from "../../lib/constants";

// Shown while a draft is still open, so a rep can fix a breach before
// confirming rather than finding out afterwards. The routing comes from the
// server, which works it out the same way the confirm does.
export function RiskPreview({ risk, routing }) {
  if (!risk || !routing) return null;

  if (routing.error) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
        <Ban className="h-4 w-4 shrink-0" aria-hidden="true" />
        {routing.error}
      </p>
    );
  }

  if (routing.roles.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-state-okBorder bg-state-okSoft px-3 py-2 text-base text-state-ok">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        Within every ceiling — this will not need a review.
      </p>
    );
  }

  const chain = routing.roles.map((role) => ROLE_LABELS[role]).join(", then ");

  return (
    <div className="rounded-lg border border-state-warnBorder bg-state-warnSoft px-3 py-2 text-state-warn">
      <p className="flex items-center gap-2 text-base font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        This quote will need {chain} approval
      </p>
      <ul className="mt-1 space-y-0.5 pl-6 text-sm">
        {risk.breaches.map((line) => (
          <li key={line.lineId}>
            {line.productName} is {line.overagePoints} points over its {line.ceilingPct}% ceiling ·{" "}
            {formatMoney(line.moneyOverCeiling)} a year
          </li>
        ))}
      </ul>
    </div>
  );
}
