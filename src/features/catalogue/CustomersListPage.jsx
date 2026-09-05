import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil, Plus } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { RecordLink } from "../../components/RecordLink";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  ListPager,
  Modal,
  SearchField,
  Select,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { downloadExport } from "../../lib/exports";
import { pageFromSearch, paginate } from "../../lib/list";

const BLANK = {
  name: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  tierId: "",
};

function CustomerDialog({ open, customer, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");

  const isEdit = Boolean(customer);

  const tiers = useQuery({
    queryKey: ["tiers"],
    queryFn: async () => (await api.get("/catalogue/tiers")).data.tiers,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(
      customer
        ? {
            name: customer.name,
            email: customer.email,
            phone: customer.phone || "",
            city: customer.city || "",
            state: customer.state || "",
            tierId: customer.tierId,
          }
        : BLANK,
    );
  }, [open, customer]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        tierId: form.tierId,
      };

      return isEdit
        ? api.patch(`/catalogue/customers/${customer.id}`, body)
        : api.post("/catalogue/customers", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast(isEdit ? `${form.name} updated` : `${form.name} added`);
      onClose();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const tier = (tiers.data || []).find((entry) => entry.id === form.tierId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${customer.name}` : "New customer"}
      description="The tier sets how much a rep may discount for them without approval."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={save.isPending}
            disabled={!form.name.trim() || !form.email.trim() || !form.tierId}
            onClick={() => save.mutate()}
          >
            {isEdit ? "Save" : "Add customer"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Company name" htmlFor="customer-name">
            <Input
              id="customer-name"
              autoFocus
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
            />
          </Field>
        </div>

        <Field label="Email" htmlFor="customer-email" hint="Where quotations are sent.">
          <Input
            id="customer-email"
            type="email"
            value={form.email}
            onChange={(event) => set("email", event.target.value)}
          />
        </Field>

        <Field label="Phone" htmlFor="customer-phone">
          <Input
            id="customer-phone"
            value={form.phone}
            onChange={(event) => set("phone", event.target.value)}
          />
        </Field>

        <Field label="City" htmlFor="customer-city">
          <Input
            id="customer-city"
            value={form.city}
            onChange={(event) => set("city", event.target.value)}
          />
        </Field>

        <Field label="State" htmlFor="customer-state">
          <Input
            id="customer-state"
            value={form.state}
            onChange={(event) => set("state", event.target.value)}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Tier"
            htmlFor="customer-tier"
            hint={tier ? `Discount ceiling ${tier.maxDiscountPct}%.` : undefined}
          >
            <Select
              id="customer-tier"
              value={form.tierId}
              onChange={(event) => set("tierId", event.target.value)}
            >
              <option value="">Choose a tier…</option>
              {(tiers.data || []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} — up to {entry.maxDiscountPct}%
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
          {error}
        </p>
      )}
    </Modal>
  );
}

export function CustomersListPage() {
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState(null);
  const toast = useToast();

  const search = params.get("search") || "";
  const page = pageFromSearch(params);

  function setParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }

  const customers = useQuery({
    queryKey: ["customers", search],
    queryFn: async () =>
      (await api.get("/catalogue/customers", { params: search ? { q: search } : {} })).data.customers,
  });

  if (customers.isLoading) return <Spinner label="Loading customers" />;
  if (customers.isError) {
    return <ErrorState message={errorMessage(customers.error)} onRetry={customers.refetch} />;
  }

  const windowed = paginate(customers.data || [], page);

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Customers"
        subtitle="Who we sell to, and how much each may be discounted."
        actions={
          <>
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => downloadExport("customers", {}, toast)}
            >
              Export CSV
            </Button>
            <Button icon={Plus} onClick={() => setDialog({})}>
              New customer
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="search">
          <SearchField
            id="search"
            value={search}
            placeholder="Name or email"
            onChange={(next) => setParam("search", next)}
          />
        </Field>
      </div>

      {windowed.total === 0 ? (
        <EmptyState
          title="No customers match"
          hint="Change the search, or add a customer."
          action={
            <Button icon={Plus} onClick={() => setDialog({})}>
              New customer
            </Button>
          }
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Customer</TH>
                <TH>Email</TH>
                <TH>City</TH>
                <TH>Tier</TH>
                <TH align="right">Ceiling</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {windowed.rows.map((customer) => (
                <TR key={customer.id}>
                  <TD>
                    <RecordLink to={`/customers/${customer.id}`}>{customer.name}</RecordLink>
                  </TD>
                  <TD>{customer.email}</TD>
                  <TD>{customer.city || "—"}</TD>
                  <TD>
                    <Badge>{customer.tier}</Badge>
                  </TD>
                  <TD figure align="right">
                    {customer.maxDiscountPct}%
                  </TD>
                  <TD align="right">
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setDialog(customer)}>
                      Edit
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          <ListPager {...windowed} onPage={(next) => setParam("page", String(next))} />
        </>
      )}

      <CustomerDialog
        open={Boolean(dialog)}
        customer={dialog?.id ? dialog : null}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
