import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Button,
  Card,
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
  useToast,
} from "../../components/ui";
import { RecordLink } from "../../components/RecordLink";
import { api, errorMessage } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import { QUOTATION_STATUS_LABELS, QUOTATION_STATUS_TONES } from "../../lib/constants";
import { useAuth } from "../../app/AuthProvider";
import { downloadExport, openPdf } from "../../lib/exports";
import { ReportFilters, applyFiltersToSearch, filtersFromSearch, filtersToParams } from "./ReportFilters";
import { Kpi } from "./Kpi";

export function ReportsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const filters = filtersFromSearch(params);
  const query = filtersToParams(filters);

  const report = useQuery({
    queryKey: ["reports", query],
    queryFn: async () => (await api.get("/dashboard/reports", { params: query })).data,
  });

  if (report.isLoading) return <Spinner label="Building the report" />;
  if (report.isError) {
    return <ErrorState message={errorMessage(report.error)} onRetry={report.refetch} />;
  }

  const data = report.data;
  const { kpis } = data;

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Reports"
        subtitle={`${data.filters.periodLabel}. Same filters as Deal Health.`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={FileText}
              onClick={() => openPdf(`/documents/exports/reports.pdf`, toast, query)}
            >
              Export PDF
            </Button>
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => downloadExport("reports", query, toast, "xls")}
            >
              Export Excel
            </Button>
          </>
        }
      />

      <ReportFilters
        filters={filters}
        options={data.options}
        role={user?.role}
        onChange={(next) => applyFiltersToSearch(next, setParams)}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Quotations" value={kpis.quotations} hint={`${data.approval.pending} pending approval`} />
        <Kpi label="Annual value" value={formatMoney(kpis.annualContractValue)} />
        <Kpi label="Payable now" value={formatMoney(kpis.payableNow)} />
        <Kpi
          label="Win rate"
          value={kpis.winRatePct === null ? "—" : `${kpis.winRatePct}%`}
          hint={`${kpis.won} won, ${kpis.lost} lost`}
        />
      </div>

      {data.quotations.length === 0 ? (
        <EmptyState title="No quotations match" hint="Widen the period or clear a filter." />
      ) : (
        <Card padded={false} className="mb-5">
          <Table>
            <THead>
              <TR>
                <TH>Quotation</TH>
                <TH>Customer</TH>
                <TH>Status</TH>
                <TH>Rep</TH>
                <TH align="right">Annual value</TH>
                <TH align="right">Created</TH>
              </TR>
            </THead>
            <TBody>
              {data.quotations.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <RecordLink to={`/quotations/${row.id}`}>{row.number}</RecordLink>
                  </TD>
                  <TD>
                    {row.customer}
                    <p className="text-xs text-sand-500">{row.tier}</p>
                  </TD>
                  <TD>
                    <StatusPill tone={QUOTATION_STATUS_TONES[row.status]}>
                      {QUOTATION_STATUS_LABELS[row.status] || row.status}
                    </StatusPill>
                  </TD>
                  <TD>{row.rep || "—"}</TD>
                  <TD figure align="right">
                    {formatMoney(row.annualContractValue)}
                  </TD>
                  <TD figure align="right">
                    {formatDate(row.createdAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {data.products.length > 0 && (
        <Card padded={false}>
          <div className="border-b border-sand-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-sand-900">By product</h2>
            <p className="mt-0.5 text-sm text-sand-600">Best sellers and how much discount they carried.</p>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>Category</TH>
                <TH align="right">Qty</TH>
                <TH align="right">Quotes</TH>
                <TH align="right">Annual value</TH>
                <TH align="right">Discount given</TH>
              </TR>
            </THead>
            <TBody>
              {data.products.map((row) => (
                <TR key={row.productId}>
                  <TD>
                    <RecordLink to={`/products/${row.productId}`}>{row.name}</RecordLink>
                    <p className="figure text-xs text-sand-500">{row.sku}</p>
                  </TD>
                  <TD>{row.category}</TD>
                  <TD figure align="right">
                    {row.qty}
                  </TD>
                  <TD figure align="right">
                    {row.quotes}
                  </TD>
                  <TD figure align="right">
                    {formatMoney(row.annualNet)}
                  </TD>
                  <TD figure align="right">
                    {formatMoney(row.discountGiven)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
