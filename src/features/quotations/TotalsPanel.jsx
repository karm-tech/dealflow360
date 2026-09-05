import { Card } from "../../components/ui";
import { formatMoney } from "../../lib/format";

function Row({ label, value, hint, strong = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <div>
        <p className={`text-sm ${strong ? "font-medium text-sand-900" : "text-sand-600"}`}>{label}</p>
        {hint && <p className="text-xs text-sand-500">{hint}</p>}
      </div>
      <p className={`figure whitespace-nowrap ${strong ? "text-lg font-semibold text-sand-900" : "text-base text-sand-800"}`}>
        {value}
      </p>
    </div>
  );
}

// One-time and recurring money cannot be added together, so each is reported on
// its own. Margin runs on the annual value, where a discount on a subscription
// line is worth what it actually costs over a year.
export function TotalsPanel({ totals }) {
  const marginTone =
    totals.marginPct === undefined
      ? ""
      : totals.marginPct >= 30
        ? "text-state-ok"
        : totals.marginPct >= 15
          ? "text-state-warn"
          : "text-state-bad";

  return (
    <Card>
      <h2 className="mb-3 text-xl font-semibold text-sand-900">Totals</h2>

      <div className="divide-y divide-sand-200">
        <Row label="One-time total" value={formatMoney(totals.oneTimeNet)} hint="net of discount" />
        <Row
          label="Recurring total"
          value={`${formatMoney(totals.recurringMonthlyNet)} / month`}
          hint="net, per month"
        />
        <Row label="Tax" value={formatMoney(totals.taxAmount)} hint="on the first invoice" />
        <Row
          label="Grand total"
          value={formatMoney(totals.grandTotal)}
          hint="first invoice, including any prorated period"
          strong
        />
        <Row
          label="Annual contract value"
          value={formatMoney(totals.annualContractValue)}
          hint="one-time plus recurring over twelve months"
        />
      </div>

      {totals.marginPct !== undefined && (
        <div className="mt-3 flex items-baseline justify-between gap-4 rounded-lg border border-sand-200 bg-sand-50 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-sand-900">Margin</p>
            <p className="text-xs text-sand-500">on annual contract value</p>
          </div>
          <p className={`figure text-lg font-semibold ${marginTone}`}>{totals.marginPct}%</p>
        </div>
      )}
    </Card>
  );
}
