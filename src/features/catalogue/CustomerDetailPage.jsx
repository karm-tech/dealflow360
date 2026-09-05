import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileText, Receipt, Repeat, ShoppingCart } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  ListPager,
  SmartButton,
  SmartButtons,
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
import { formatDate, formatMoney } from "../../lib/format";
import {
  OPEN_QUOTATION_STATUSES,
  QUOTATION_STATUS_LABELS,
  QUOTATION_STATUS_TONES,
} from "../../lib/constants";

function Detail({ label, children }) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase text-sand-500">{label}</p>
      <p className="mt-0.5 text-base text-sand-900">{children || "—"}</p>
    </div>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = pageFromSearch(params);

  const customer = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => (await api.get(`/catalogue/customers/${id}`)).data,
  });

  if (customer.isLoading) return <Spinner label="Loading customer" />;
  if (customer.isError) {
    return <ErrorState message={errorMessage(customer.error)} onRetry={customer.refetch} />;
  }

  const { customer: record, quotations, counts } = customer.data;
  const windowed = paginate(quotations, page);

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title={record.name}
        subtitle={record.email}
        actions={
          <SmartButtons>
            <SmartButton
              count={counts.open}
              label="Open"
              icon={FileText}
              to={`/quotations?customerId=${record.id}&status=${OPEN_QUOTATION_STATUSES}`}
            />
            <SmartButton
              count={counts.orders}
              label="Orders"
              icon={ShoppingCart}
              to={`/quotations?customerId=${record.id}&status=CONFIRMED`}
            />
            <SmartButton
              count={counts.invoices}
              label="Invoices"
              icon={Receipt}
              to={`/billing?customerId=${record.id}`}
            />
            <SmartButton
              count={counts.subscriptions}
              label="Subscriptions"
              icon={Repeat}
              to={`/billing?view=subscriptions&customerId=${record.id}`}
            />
          </SmartButtons>
        }
      />

      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Tier">
            <span className="flex items-center gap-2">
              <Badge>{record.tier}</Badge>
              <span className="text-sm text-sand-600">up to {record.maxDiscountPct}%</span>
            </span>
          </Detail>
          <Detail label="Phone">{record.phone}</Detail>
          <Detail label="Location">
            {[record.city, record.state].filter(Boolean).join(", ")}
          </Detail>
          <Detail label="Customer since">{formatDate(record.createdAt)}</Detail>
        </div>
      </Card>

      <h2 className="mb-3 text-xl font-semibold text-sand-900">Quotations</h2>

      {windowed.total === 0 ? (
        <EmptyState
          title="No quotations yet"
          hint="Quotations raised for this customer will be listed here."
        />
      ) : (
        <>
        <Table>
          <THead>
            <TR>
              <TH>Number</TH>
              <TH align="right">Annual value</TH>
              <TH>Stage</TH>
              <TH align="right">Created</TH>
            </TR>
          </THead>
          <TBody>
            {windowed.rows.map((row) => (
              <TR key={row.id} onClick={() => navigate(`/quotations/${row.id}`)}>
                <TD className="font-medium text-ink-700">{row.number}</TD>
                <TD figure align="right">
                  {formatMoney(row.annualContractValue)}
                </TD>
                <TD>
                  <StatusPill tone={QUOTATION_STATUS_TONES[row.status]}>
                    {QUOTATION_STATUS_LABELS[row.status]}
                  </StatusPill>
                </TD>
                <TD align="right" className="whitespace-nowrap text-sand-600">
                  {formatDate(row.createdAt)}
                </TD>
              </TR>
            ))}
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
