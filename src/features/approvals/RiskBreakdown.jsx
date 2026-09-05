import { Table, THead, TBody, TR, TH, TD, StatusPill } from "../../components/ui";
import { formatMoney } from "../../lib/format";

// Score and money read together: the points say a ceiling was broken, the
// rupees say whether it matters.
export function RiskSummary({ risk }) {
  return (
    <div className="flex flex-wrap gap-6">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-wide text-sand-600">
          Blended risk score
        </p>
        <p className="figure text-2xl font-semibold text-sand-900">
          {risk.score} <span className="text-base font-normal text-sand-600">points</span>
        </p>
      </div>
      <div>
        <p className="text-2xs font-semibold uppercase tracking-wide text-sand-600">
          Given away past ceiling
        </p>
        <p className="figure text-2xl font-semibold text-sand-900">
          {formatMoney(risk.moneyOverCeiling)}
          <span className="ml-1 text-base font-normal text-sand-600">a year</span>
        </p>
      </div>
    </div>
  );
}

// Every line against the ceiling that applies to it, so an approver sees which
// one broke the rule rather than only the total.
export function RiskBreakdown({ risk }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Line</TH>
          <TH>Category</TH>
          <TH align="right">Discount</TH>
          <TH align="right">Ceiling</TH>
          <TH align="right">Over</TH>
          <TH align="right">Value</TH>
        </TR>
      </THead>
      <TBody>
        {risk.lines.map((line) => (
          <TR key={line.lineId} selected={line.isBreach}>
            <TD>{line.productName}</TD>
            <TD>{line.category}</TD>
            <TD figure align="right">
              {line.discountPct}%
            </TD>
            <TD figure align="right">
              {line.ceilingPct}%
            </TD>
            <TD align="right">
              {line.isBreach ? (
                <StatusPill tone="warn">+{line.overagePoints}</StatusPill>
              ) : (
                <span className="text-sand-500">—</span>
              )}
            </TD>
            <TD figure align="right">
              {line.isBreach ? formatMoney(line.moneyOverCeiling) : "—"}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
