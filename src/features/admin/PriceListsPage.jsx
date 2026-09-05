// Price lists: what a product costs a particular tier of customer.
//
// A list with no tier prices everyone; one with a tier beats it for that tier's
// customers. Changing a price here only affects lines added afterwards, because
// a line captures its price when it goes on the quotation.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  ListPager,
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
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { paginate } from "../../lib/list";

const ITEMS_PAGE = 10;

function ListDialog({ open, tiers, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", tierId: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm({ name: "", tierId: "" });
  }, [open]);

  const create = useMutation({
    mutationFn: () =>
      api.post("/config/price-lists", {
        name: form.name.trim(),
        tierId: form.tierId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] });
      toast(`${form.name} created`);
      onClose();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New price list"
      description="Leave the tier empty for a list that applies to every customer."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={create.isPending} disabled={!form.name.trim()} onClick={() => create.mutate()}>
            Create
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="list-name" tooltip="Internal label. Shown when choosing which list a tier uses.">
          <Input
            id="list-name"
            autoFocus
            value={form.name}
            onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
            placeholder="Gold pricing"
          />
        </Field>

        <Field label="Tier" htmlFor="list-tier" tooltip="Optional. Customers on this tier pick these prices before the catalogue list.">
          <Select
            id="list-tier"
            value={form.tierId}
            onChange={(event) => setForm((c) => ({ ...c, tierId: event.target.value }))}
          >
            <option value="">Everyone</option>
            {tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
          {error}
        </p>
      )}
    </Modal>
  );
}

function PriceDialog({ open, list, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ productId: "", price: "" });
  const [error, setError] = useState("");

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await api.get("/catalogue/products")).data.products,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm({ productId: "", price: "" });
  }, [open]);

  const save = useMutation({
    mutationFn: () =>
      api.post(`/config/price-lists/${list.id}/items`, {
        productId: Number(form.productId),
        price: Number(form.price),
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] });
      toast(response.data.updated ? "Price updated" : "Price added");
      onClose();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const chosen = (products.data || []).find((product) => String(product.id) === form.productId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Price a product on ${list?.name || ""}`}
      description="Pricing a product already on the list replaces its price."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={save.isPending}
            disabled={!form.productId || form.price === ""}
            onClick={() => save.mutate()}
          >
            Save price
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product" htmlFor="price-product" tooltip="One price per product on this list. Variants still add their extra on top.">
          <Select
            id="price-product"
            value={form.productId}
            onChange={(event) => setForm((c) => ({ ...c, productId: event.target.value }))}
          >
            <option value="">Choose a product…</option>
            {(products.data || []).map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.sku})
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Price"
          htmlFor="price-value"
          hint={chosen ? `Catalogue price is ${formatMoney(chosen.price)}.` : undefined}
          tooltip="What this list charges for the product before a variant extra or a discount."
        >
          <Input
            id="price-value"
            type="number"
            min={0}
            value={form.price}
            onChange={(event) => setForm((c) => ({ ...c, price: event.target.value }))}
          />
        </Field>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
          {error}
        </p>
      )}
    </Modal>
  );
}

function PriceListItems({ list, onRemove }) {
  const [page, setPage] = useState(1);
  const windowed = paginate(list.items, page, ITEMS_PAGE);

  return (
    <div className="px-6 pb-6">
      <Table>
        <THead>
          <TR>
            <TH>Product</TH>
            <TH align="right">Catalogue price</TH>
            <TH align="right">This list</TH>
            <TH align="right">Difference</TH>
            <TH align="right" />
          </TR>
        </THead>
        <TBody>
          {windowed.rows.map((item) => {
            const difference = item.price - item.listPrice;

            return (
              <TR key={item.id}>
                <TD>
                  {item.productName}
                  <Badge className="ml-2">{item.sku}</Badge>
                </TD>
                <TD figure align="right">
                  {formatMoney(item.listPrice)}
                </TD>
                <TD figure align="right">
                  {formatMoney(item.price)}
                </TD>
                <TD figure align="right">
                  {difference === 0 ? (
                    <span className="text-sand-500">same</span>
                  ) : (
                    <StatusPill tone={difference < 0 ? "info" : "warn"}>
                      {difference < 0 ? "−" : "+"}
                      {formatMoney(Math.abs(difference))}
                    </StatusPill>
                  )}
                </TD>
                <TD align="right">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={X}
                    onClick={() => onRemove({ listId: list.id, itemId: item.id })}
                  >
                    Remove
                  </Button>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <ListPager {...windowed} pageSize={ITEMS_PAGE} onPage={setPage} />
    </div>
  );
}

export function PriceListsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [pricing, setPricing] = useState(null);

  const lists = useQuery({
    queryKey: ["price-lists"],
    queryFn: async () => (await api.get("/config/price-lists")).data.priceLists,
  });

  const tiers = useQuery({
    queryKey: ["config-tiers"],
    queryFn: async () => (await api.get("/config/tiers")).data.tiers,
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/config/price-lists/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] });
      toast("Price list updated");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  const removeList = useMutation({
    mutationFn: (id) => api.delete(`/config/price-lists/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] });
      toast("Price list deleted");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  const removeItem = useMutation({
    mutationFn: ({ listId, itemId }) => api.delete(`/config/price-lists/${listId}/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] });
      toast("Price removed");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  if (lists.isLoading || tiers.isLoading) return <Spinner label="Loading price lists" />;
  if (lists.isError) return <ErrorState message={errorMessage(lists.error)} onRetry={lists.refetch} />;

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Price lists"
        subtitle="A tier list beats a general one. Neither changes a price already captured on a quotation line."
        actions={
          <Button icon={Plus} onClick={() => setIsCreating(true)}>
            New price list
          </Button>
        }
      />

      {lists.data.length === 0 ? (
        <EmptyState
          title="No price lists yet"
          hint="Without one, every line is priced from the catalogue price."
          action={
            <Button icon={Plus} onClick={() => setIsCreating(true)}>
              New price list
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {lists.data.map((list) => (
            <Card key={list.id} padded={false}>
              <div className="p-6">
                <CardHeader
                  title={list.name}
                  subtitle={
                    list.tier
                      ? `Applies to ${list.tier.name} customers only.`
                      : "Applies to every customer without a tier list."
                  }
                  actions={
                    <>
                      <StatusPill tone={list.isActive ? "ok" : "neutral"}>
                        {list.isActive ? "Active" : "Inactive"}
                      </StatusPill>
                      <Button size="sm" variant="secondary" icon={Plus} onClick={() => setPricing(list)}>
                        Price a product
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggle.mutate({ id: list.id, isActive: !list.isActive })}
                      >
                        {list.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        onClick={() => removeList.mutate(list.id)}
                      >
                        Delete
                      </Button>
                    </>
                  }
                />
              </div>

              {list.items.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-sand-600">
                  Nothing priced yet, so this list changes nothing.
                </p>
              ) : (
                <PriceListItems list={list} onRemove={removeItem.mutate} />
              )}
            </Card>
          ))}
        </div>
      )}

      <ListDialog open={isCreating} tiers={tiers.data || []} onClose={() => setIsCreating(false)} />
      <PriceDialog open={Boolean(pricing)} list={pricing} onClose={() => setPricing(null)} />
    </div>
  );
}
