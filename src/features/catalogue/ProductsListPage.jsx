import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus } from "lucide-react";
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
  Textarea,
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
import { formatMoney } from "../../lib/format";
import { pageFromSearch, paginate } from "../../lib/list";
import { downloadExport } from "../../lib/exports";
import { BILLING_TYPE, BILLING_TYPE_LABELS } from "../../lib/constants";

// Goods are counted in a warehouse and can run short; a service never is. How
// the line is charged is a separate question, so it is a separate field.
const BLANK = {
  name: "",
  sku: "",
  categoryId: "",
  isStockable: true,
  unit: "unit",
  salesPrice: "",
  cost: "",
  taxRatePct: "18",
  defaultBillingType: BILLING_TYPE.ONE_TIME,
  defaultPlanId: "",
  description: "",
};

function NewProductDialog({ open, onClose }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get("/catalogue/categories")).data.categories,
    enabled: open,
  });

  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/catalogue/plans")).data.plans,
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setForm(BLANK);
      setError("");
    }
  }, [open]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const isRecurring = form.defaultBillingType === BILLING_TYPE.RECURRING;

  const create = useMutation({
    mutationFn: () =>
      api.post("/catalogue/products", {
        name: form.name.trim(),
        sku: form.sku.trim(),
        categoryId: Number(form.categoryId),
        unit: form.unit.trim() || "unit",
        salesPrice: Number(form.salesPrice),
        cost: Number(form.cost),
        taxRatePct: Number(form.taxRatePct),
        isStockable: form.isStockable,
        defaultBillingType: form.defaultBillingType,
        defaultPlanId: isRecurring ? form.defaultPlanId || "MONTHLY" : null,
        description: form.description.trim() || null,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast(`${response.data.name} added to the catalogue`);
      onClose();
      navigate(`/products/${response.data.id}`);
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const isComplete =
    form.name.trim() && form.sku.trim() && form.categoryId && form.salesPrice !== "" && form.cost !== "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New product"
      description="Added to the catalogue and available on a quotation straight away."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={create.isPending}
            disabled={!isComplete}
            onClick={() => create.mutate()}
          >
            Add product
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Name" htmlFor="product-name" tooltip="How the product appears on quotations, the portal and PDFs.">
            <Input
              id="product-name"
              autoFocus
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Laser Printer"
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field
            label="Description"
            htmlFor="product-description"
            hint="Shown on the product and on quotations."
            tooltip="A short commercial description. Not used in pricing."
          >
            <Textarea
              id="product-description"
              rows={2}
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="What this is, in one or two sentences."
            />
          </Field>
        </div>

        <Field label="SKU" htmlFor="product-sku" hint="Must be unique." tooltip="Internal code. Used in search and on documents.">
          <Input
            id="product-sku"
            value={form.sku}
            onChange={(event) => set("sku", event.target.value)}
            placeholder="PRN-014"
          />
        </Field>

        <Field label="Category" htmlFor="product-category" tooltip="The category ceiling can cap the discount on a line, whichever is stricter with the customer tier.">
          <Select
            id="product-category"
            value={form.categoryId}
            onChange={(event) => set("categoryId", event.target.value)}
          >
            <option value="">Choose a category…</option>
            {(categories.data || []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex items-end">
          <label htmlFor="product-stockable" className="flex items-start gap-3 py-2">
            <input
              id="product-stockable"
              type="checkbox"
              checked={form.isStockable}
              onChange={(event) => set("isStockable", event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-sand-300 text-ink-700 focus:ring-ink-500/20"
            />
            <span>
              <span className="block text-sm font-medium text-sand-800">Stockable</span>
              <span className="mt-0.5 block text-xs text-sand-600">
                Counted in a warehouse. Leave off for a service.
              </span>
            </span>
          </label>
        </div>

        <Field label="Unit" htmlFor="product-unit" tooltip="Printed next to quantity. Does not change how stock is counted.">
          <Input
            id="product-unit"
            value={form.unit}
            onChange={(event) => set("unit", event.target.value)}
            placeholder="unit"
          />
        </Field>

        <Field label="Sales price" htmlFor="product-price" tooltip="Catalogue list price. A price list or variant extra can change what a line actually charges.">
          <Input
            id="product-price"
            type="number"
            min={0}
            value={form.salesPrice}
            onChange={(event) => set("salesPrice", event.target.value)}
          />
        </Field>

        <Field label="Cost" htmlFor="product-cost" hint="Internal only; drives margin." tooltip="Never sent to the portal. Margin on a quotation is list minus this, after discount.">
          <Input
            id="product-cost"
            type="number"
            min={0}
            value={form.cost}
            onChange={(event) => set("cost", event.target.value)}
          />
        </Field>

        <Field label="Tax %" htmlFor="product-tax" tooltip="Applied on the first invoice, after discount.">
          <Input
            id="product-tax"
            type="number"
            min={0}
            max={100}
            value={form.taxRatePct}
            onChange={(event) => set("taxRatePct", event.target.value)}
          />
        </Field>

        <Field label="Billing" htmlFor="product-billing" hint="Only the default; the line can change it." tooltip="One-time raises an invoice on confirm. Recurring opens a subscription.">
          <Select
            id="product-billing"
            value={form.defaultBillingType}
            onChange={(event) => set("defaultBillingType", event.target.value)}
          >
            {Object.entries(BILLING_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        {isRecurring && (
          <Field label="Period" htmlFor="product-plan" tooltip="How often a recurring line is billed. The quotation line can still pick another plan.">
            <Select
              id="product-plan"
              value={form.defaultPlanId || "MONTHLY"}
              onChange={(event) => set("defaultPlanId", event.target.value)}
            >
              {(plans.data || []).map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
          {error}
        </p>
      )}
    </Modal>
  );
}

export function ProductsListPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [isCreating, setIsCreating] = useState(false);

  const search = params.get("search") || "";
  const kind = params.get("kind") || "";
  const page = pageFromSearch(params);

  function setParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // A new filter starts at the first page; the page control is the exception.
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }

  const products = useQuery({
    queryKey: ["products", search],
    queryFn: async () =>
      (await api.get("/catalogue/products", { params: search ? { q: search } : {} })).data.products,
  });

  if (products.isLoading) return <Spinner label="Loading catalogue" />;
  if (products.isError) {
    return <ErrorState message={errorMessage(products.error)} onRetry={products.refetch} />;
  }

  const filtered = (products.data || []).filter((product) => {
    if (kind === "goods") return product.isStockable;
    if (kind === "service") return !product.isStockable;
    return true;
  });

  const windowed = paginate(filtered, page);

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Products"
        subtitle="The catalogue every quotation line is priced from."
        actions={
          <>
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => downloadExport("products", { q: search, kind }, toast)}
            >
              Export CSV
            </Button>
            <Button icon={Plus} onClick={() => setIsCreating(true)}>
              New product
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="search" tooltip="Matches product name or SKU.">
          <SearchField
            id="search"
            value={search}
            placeholder="Name or SKU"
            onChange={(next) => setParam("search", next)}
          />
        </Field>

        <Field label="Type" htmlFor="kind" tooltip="Stockable goods versus services and subscriptions.">
          <Select
            id="kind"
            value={kind}
            onChange={(event) => setParam("kind", event.target.value)}
            className="!w-40"
          >
            <option value="">All</option>
            <option value="goods">Goods</option>
            <option value="service">Services</option>
          </Select>
        </Field>
      </div>

      {windowed.total === 0 ? (
        <EmptyState
          title="No products match"
          hint="Change the filters, or add a product to the catalogue."
          action={
            <Button icon={Plus} onClick={() => setIsCreating(true)}>
              New product
            </Button>
          }
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>SKU</TH>
                <TH>Category</TH>
                <TH>Type</TH>
                <TH>Billing</TH>
                <TH align="right">Price</TH>
                <TH align="right">On hand</TH>
              </TR>
            </THead>

            <TBody>
              {windowed.rows.map((product) => (
                <TR key={product.id}>
                  <TD>
                    <RecordLink to={`/products/${product.id}`}>{product.name}</RecordLink>
                  </TD>
                  <TD figure>{product.sku}</TD>
                  <TD>{product.category}</TD>
                  <TD>
                    <Badge>{product.isStockable ? "Goods" : "Service"}</Badge>
                  </TD>
                  <TD>{BILLING_TYPE_LABELS[product.defaultBillingType]}</TD>
                  <TD figure align="right">
                    {formatMoney(product.price)}
                  </TD>
                  {/* A service is never counted, so a figure here would be a
                      number that means nothing. */}
                  <TD figure align="right">
                    {product.isStockable ? product.onHand : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          <ListPager {...windowed} onPage={(next) => setParam("page", String(next))} />
        </>
      )}

      <NewProductDialog open={isCreating} onClose={() => setIsCreating(false)} />
    </div>
  );
}
