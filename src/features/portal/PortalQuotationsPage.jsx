import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  Button,
  EmptyState,
  ErrorState,
  ListPager,
  Spinner,
  StatusPill,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import { paginate } from "../../lib/list";

export function PortalQuotationsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const quotations = useQuery({
    queryKey: ["portal-quotations"],
    queryFn: async () => (await api.get("/portal/quotations")).data.quotations,
  });

  if (quotations.isLoading) return <Spinner label="Loading your quotations" />;
  if (quotations.isError) {
    return <ErrorState message={errorMessage(quotations.error)} onRetry={quotations.refetch} />;
  }

  const rows = quotations.data;
  const waiting = rows.filter((row) => row.needsDecision).length;
  const windowed = paginate(rows, page);

  return (
    <div className="animate-fadeUp">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-sand-900">Your quotations</h1>
        <p className="mt-1 text-base text-sand-600">
          {waiting > 0
            ? `${waiting} ${waiting === 1 ? "quotation is" : "quotations are"} waiting for your decision.`
            : "Everything you have asked us to price, and where each one has got to."}
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="No quotations yet"
          hint="Add products from the catalogue and send us a request to get started."
          action={<Button onClick={() => navigate("/portal")}>Browse the catalogue</Button>}
        />
      ) : (
        <>
          <ul className="rounded-xl border border-sand-200 bg-surface shadow-card">
            {windowed.rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/portal/quotations/${row.id}`)}
                  className="flex w-full flex-wrap items-center gap-3 border-b border-sand-200 px-4 py-3.5 text-left transition-colors hover:bg-sand-50 last:border-0"
                >
                  <div className="min-w-40 flex-1">
                    <p className="figure text-base font-medium text-sand-900">{row.number}</p>
                    <p className="mt-0.5 text-xs text-sand-600">
                      {row.lineCount} {row.lineCount === 1 ? "product" : "products"} · asked{" "}
                      {formatDate(row.createdAt)}
                    </p>
                  </div>

                  <StatusPill tone={row.tone}>{row.label}</StatusPill>

                  <p className="figure w-32 text-right text-base text-sand-900">
                    {row.total === null ? (
                      <span className="text-sm text-sand-500">Being priced</span>
                    ) : (
                      formatMoney(row.total)
                    )}
                  </p>

                  <ChevronRight className="h-4 w-4 shrink-0 text-sand-400" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          <ListPager {...windowed} onPage={setPage} />
        </>
      )}
    </div>
  );
}
