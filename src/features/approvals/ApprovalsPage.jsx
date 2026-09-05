import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/PageHeader";
import {
  EmptyState,
  ErrorState,
  Spinner,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { daysSince, formatMoney } from "../../lib/format";
import { ROLE_LABELS } from "../../lib/constants";

export function ApprovalsPage() {
  const navigate = useNavigate();

  const approvals = useQuery({
    queryKey: ["approvals"],
    queryFn: async () => (await api.get("/approvals")).data.quotations,
  });

  if (approvals.isLoading) return <Spinner label="Loading approvals" />;
  if (approvals.isError) {
    return <ErrorState message={errorMessage(approvals.error)} onRetry={approvals.refetch} />;
  }

  const rows = approvals.data;

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Approvals"
        subtitle="Quotations routed to you because their discounts sit past a ceiling."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing waiting on you"
          hint="A quotation appears here when a rep confirms one whose discounts need your sign-off."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Quotation</TH>
              <TH>Customer</TH>
              <TH align="right">Risk</TH>
              <TH align="right">Over ceiling</TH>
              <TH>Waiting on</TH>
              <TH align="right">Waiting</TH>
              <TH align="right">Value</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => {
              const waitingDays = daysSince(row.waitingSince);

              return (
                <TR key={row.id} onClick={() => navigate(`/quotations/${row.id}?scope=approvals`)}>
                  <TD>{row.number}</TD>
                  <TD>
                    {row.customer.name} <span className="text-sand-500">· {row.customer.tier}</span>
                  </TD>
                  <TD align="right">
                    <StatusPill tone={row.riskScore >= 5 ? "bad" : "warn"}>
                      {row.riskScore} pts
                    </StatusPill>
                  </TD>
                  <TD figure align="right">
                    {formatMoney(row.moneyOverCeiling)}
                  </TD>
                  <TD>{ROLE_LABELS[row.waitingOnRole]}</TD>
                  <TD figure align="right">
                    {waitingDays === 0 ? "today" : `${waitingDays}d`}
                  </TD>
                  <TD figure align="right">
                    {formatMoney(row.annualContractValue)}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
