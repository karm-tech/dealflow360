import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/PageHeader";
import {
  EmptyState,
  ErrorState,
  ListPager,
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
import { pageFromSearch, paginate } from "../../lib/list";
import { daysSince, formatMoney } from "../../lib/format";
import { ROLE_LABELS } from "../../lib/constants";

export function ApprovalsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = pageFromSearch(params);

  const approvals = useQuery({
    queryKey: ["approvals"],
    queryFn: async () => (await api.get("/approvals")).data.quotations,
  });

  if (approvals.isLoading) return <Spinner label="Loading approvals" />;
  if (approvals.isError) {
    return <ErrorState message={errorMessage(approvals.error)} onRetry={approvals.refetch} />;
  }

  const windowed = paginate(approvals.data, page);
  const rows = windowed.rows;

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Approvals"
        subtitle="Quotations routed to you because their discounts sit past a ceiling."
      />

      {windowed.total === 0 ? (
        <EmptyState
          title="Nothing waiting on you"
          hint="A quotation appears here when a rep sends one whose discounts need your sign-off."
        />
      ) : (
        <>
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
        <ListPager
          {...windowed}
          onPage={(next) => {
            const nextParams = new URLSearchParams(params);
            if (next <= 1) nextParams.delete("page");
            else nextParams.set("page", String(next));
            setParams(nextParams, { replace: true });
          }}
        />
        </>
      )}
    </div>
  );
}
