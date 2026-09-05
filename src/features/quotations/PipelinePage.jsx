import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/PageHeader";
import { Badge, ErrorState, Spinner } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { PIPELINE_STAGES, QUOTATION_STATUS_LABELS } from "../../lib/constants";

function Column({ stage, deals, onOpen }) {
  const total = deals.reduce((sum, deal) => sum + deal.annualContractValue, 0);

  return (
    <section className="flex w-72 shrink-0 flex-col rounded-xl border border-sand-200 bg-sand-50">
      <header className="border-b border-sand-200 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-sand-900">{QUOTATION_STATUS_LABELS[stage]}</h2>
          <span className="figure text-xs text-sand-600">{deals.length}</span>
        </div>
        <p className="figure mt-0.5 text-xs text-sand-600">{formatMoney(total)}</p>
      </header>

      <div className="flex flex-col gap-2 p-2">
        {deals.map((deal) => (
          <button
            key={deal.id}
            type="button"
            onClick={() => onOpen(deal.id)}
            className="rounded-lg border border-sand-200 bg-surface p-3 text-left transition-colors hover:border-ink-200 hover:bg-ink-50"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-sand-900">{deal.customer.name}</span>
              <Badge>{deal.customer.tier}</Badge>
            </div>
            <p className="figure mt-1 text-base text-sand-900">
              {formatMoney(deal.annualContractValue)}
            </p>
            <p className="mt-0.5 text-xs text-sand-500">
              {deal.number} · {deal.rep || "unassigned"}
            </p>
          </button>
        ))}

        {deals.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-sand-500">Nothing at this stage.</p>
        )}
      </div>
    </section>
  );
}

export function PipelinePage() {
  const navigate = useNavigate();

  const quotations = useQuery({
    queryKey: ["quotations", "pipeline"],
    queryFn: async () => (await api.get("/quotations")).data.quotations,
  });

  if (quotations.isLoading) return <Spinner label="Loading pipeline" />;
  if (quotations.isError) {
    return <ErrorState message={errorMessage(quotations.error)} onRetry={quotations.refetch} />;
  }

  const byStage = Object.fromEntries(
    PIPELINE_STAGES.map((stage) => [stage, quotations.data.filter((deal) => deal.status === stage)]),
  );

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Pipeline"
        subtitle="Deals by stage. A card moves when the workflow moves it, so stages cannot be dragged."
      />

      <div className="flex gap-3 overflow-x-auto pb-3">
        {PIPELINE_STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            deals={byStage[stage]}
            onOpen={(id) => navigate(`/quotations/${id}`)}
          />
        ))}
      </div>
    </div>
  );
}
