import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
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
import { formatDate, formatMoney } from "../../lib/format";
import {
  PIPELINE_STAGES,
  QUOTATION_STATUS_LABELS,
  QUOTATION_STATUS_TONES,
} from "../../lib/constants";

const SORTS = {
  newest: { label: "Newest first", compare: (a, b) => new Date(b.createdAt) - new Date(a.createdAt) },
  value: { label: "Highest value", compare: (a, b) => b.annualContractValue - a.annualContractValue },
  customer: { label: "Customer name", compare: (a, b) => a.customer.name.localeCompare(b.customer.name) },
};

function NewQuotationDialog({ open, onClose }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [error, setError] = useState("");

  const customers = useQuery({
    queryKey: ["customers"],
    enabled: open,
    queryFn: async () => (await api.get("/catalogue/customers")).data.customers,
  });

  const create = useMutation({
    mutationFn: () => api.post("/quotations", { customerId: Number(customerId) }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      onClose();
      navigate(`/quotations/${response.data.id}`);
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New quotation"
      description="Pick the customer. Their tier sets the prices and the discount ceiling."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={create.isPending}
            disabled={!customerId}
            onClick={() => create.mutate()}
          >
            Create draft
          </Button>
        </>
      }
    >
      <Field label="Customer" htmlFor="customer" error={error}>
        <Select
          id="customer"
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
        >
          <option value="">Choose a customer…</option>
          {(customers.data || []).map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} — {customer.tier} (up to {customer.maxDiscountPct}%)
            </option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}

export function QuotationsListPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [isCreating, setIsCreating] = useState(false);

  const quotations = useQuery({
    queryKey: ["quotations", status, search],
    queryFn: async () =>
      (await api.get("/quotations", { params: { status: status || undefined, search: search || undefined } }))
        .data.quotations,
  });

  if (quotations.isLoading) return <Spinner label="Loading quotations" />;
  if (quotations.isError) {
    return <ErrorState message={errorMessage(quotations.error)} onRetry={quotations.refetch} />;
  }

  const rows = [...quotations.data].sort(SORTS[sort].compare);

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Quotations"
        subtitle="Every deal, from first draft to confirmed order."
        actions={
          <Button icon={Plus} onClick={() => setIsCreating(true)}>
            New quotation
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="search">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sand-400"
              aria-hidden="true"
            />
            <Input
              id="search"
              value={search}
              placeholder="Number or customer"
              onChange={(event) => setSearch(event.target.value)}
              className="!w-64 !pl-9"
            />
          </div>
        </Field>

        <Field label="Stage" htmlFor="status">
          <Select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="!w-48"
          >
            <option value="">All stages</option>
            {PIPELINE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {QUOTATION_STATUS_LABELS[stage]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Sort by" htmlFor="sort">
          <Select id="sort" value={sort} onChange={(event) => setSort(event.target.value)} className="!w-44">
            {Object.entries(SORTS).map(([value, option]) => (
              <option key={value} value={value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No quotations match"
          hint="Change the filters, or start a new quotation for a customer."
          action={
            <Button icon={Plus} onClick={() => setIsCreating(true)}>
              New quotation
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Number</TH>
              <TH>Customer</TH>
              <TH>Rep</TH>
              <TH align="right">Annual value</TH>
              <TH align="right">Lines</TH>
              <TH>Stage</TH>
              <TH align="right">Created</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id} onClick={() => navigate(`/quotations/${row.id}`)}>
                <TD className="font-medium text-ink-700">{row.number}</TD>
                <TD>
                  <span className="flex flex-wrap items-center gap-2">
                    {row.customer.name}
                    <Badge>{row.customer.tier}</Badge>
                  </span>
                </TD>
                <TD>{row.rep || "—"}</TD>
                <TD figure align="right">
                  {formatMoney(row.annualContractValue)}
                </TD>
                <TD figure align="right">
                  {row.lineCount}
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
      )}

      <NewQuotationDialog open={isCreating} onClose={() => setIsCreating(false)} />
    </div>
  );
}
