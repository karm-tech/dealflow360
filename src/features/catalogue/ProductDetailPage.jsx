import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Save, Trash2, Warehouse } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  FieldHelp,
  Input,
  Select,
  SmartButton,
  SmartButtons,
  Spinner,
  Textarea,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from "../../components/ui";
import { useAuth } from "../../app/AuthProvider";
import { api, errorMessage } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { BILLING_TYPE, BILLING_TYPE_LABELS, ROLES } from "../../lib/constants";

function Detail({ label, children }) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase text-sand-500">{label}</p>
      <p className="mt-0.5 text-base text-sand-900">{children ?? "—"}</p>
    </div>
  );
}

function CheckRow({ id, label, hint, tooltip, checked, onChange }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 rounded-lg border border-sand-200 px-3 py-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-sand-300 text-ink-700 focus:ring-ink-500/20"
      />
      <span>
        <span className="inline-flex items-center text-sm font-medium text-sand-800">
          {label}
          <FieldHelp text={tooltip} />
        </span>
        {hint && <span className="mt-0.5 block text-xs text-sand-600">{hint}</span>}
      </span>
    </label>
  );
}

function VariantsCard({ productId, variants, canEdit }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState({ attribute: "", value: "", extraPrice: "0" });

  const add = useMutation({
    mutationFn: () =>
      api.post(`/catalogue/products/${productId}/variants`, {
        attribute: draft.attribute.trim(),
        value: draft.value.trim(),
        extraPrice: Number(draft.extraPrice) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", String(productId)] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDraft({ attribute: "", value: "", extraPrice: "0" });
      toast("Variant added");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  const remove = useMutation({
    mutationFn: (variantId) => api.delete(`/catalogue/products/${productId}/variants/${variantId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", String(productId)] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast("Variant removed");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  const canAdd = draft.attribute.trim() && draft.value.trim();

  return (
    <Card padded={false} className="lg:col-span-2">
      <div className="border-b border-sand-200 px-6 py-4">
        <h2 className="text-xl font-semibold text-sand-900">Variants</h2>
        <p className="mt-0.5 text-sm text-sand-600">
          Attribute, value and extra price. The extra is added on top of the list price when the
          variant is chosen on a quotation.
        </p>
      </div>

      {variants.length === 0 && !canEdit ? (
        <p className="px-6 py-4 text-sm text-sand-600">This product has no variants.</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Attribute</TH>
              <TH>Value</TH>
              <TH align="right">Extra price</TH>
              {canEdit && <TH />}
            </TR>
          </THead>
          <TBody>
            {variants.map((variant) => (
              <TR key={variant.id}>
                <TD>{variant.attribute}</TD>
                <TD>{variant.value}</TD>
                <TD figure align="right">
                  {variant.extraPrice ? `+ ${formatMoney(variant.extraPrice)}` : "—"}
                </TD>
                {canEdit && (
                  <TD align="right">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      onClick={() => remove.mutate(variant.id)}
                    >
                      Remove
                    </Button>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-end gap-3 border-t border-sand-200 px-6 py-4">
          <Field label="Attribute" htmlFor="variant-attribute" tooltip="What differs between options, such as RAM or Cover.">
            <Input
              id="variant-attribute"
              value={draft.attribute}
              onChange={(event) => setDraft((current) => ({ ...current, attribute: event.target.value }))}
              placeholder="Size or Pack"
              className="!w-36"
            />
          </Field>
          <Field label="Value" htmlFor="variant-value" tooltip="The option the customer picks. Combined with the attribute it must be unique on this product.">
            <Input
              id="variant-value"
              value={draft.value}
              onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))}
              placeholder="16 GB"
              className="!w-36"
            />
          </Field>
          <Field label="Extra price" htmlFor="variant-extra" tooltip="Added on top of the list or price-list amount when this variant is chosen.">
            <Input
              id="variant-extra"
              type="number"
              min={0}
              value={draft.extraPrice}
              onChange={(event) => setDraft((current) => ({ ...current, extraPrice: event.target.value }))}
              className="!w-28"
            />
          </Field>
          <Button icon={Plus} disabled={!canAdd} isLoading={add.isPending} onClick={() => add.mutate()}>
            Add variant
          </Button>
        </div>
      )}
    </Card>
  );
}

function formFrom(record) {
  return {
    name: record.name,
    sku: record.sku,
    categoryId: String(record.categoryId),
    unit: record.unit,
    salesPrice: String(record.salesPrice),
    cost: String(record.cost),
    taxRatePct: String(record.taxRatePct),
    isStockable: record.isStockable,
    defaultBillingType: record.defaultBillingType,
    defaultPlanId: record.defaultPlanId || "MONTHLY",
    warrantyMonths: record.warrantyMonths == null ? "" : String(record.warrantyMonths),
    description: record.description || "",
  };
}

export function ProductDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canEdit = user?.role === ROLES.ADMIN;

  const [form, setForm] = useState(null);
  const [error, setError] = useState("");

  const product = useQuery({
    queryKey: ["product", id],
    queryFn: async () => (await api.get(`/catalogue/products/${id}`)).data,
  });

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await api.get("/catalogue/categories")).data.categories,
    enabled: canEdit,
  });

  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/catalogue/plans")).data.plans,
    enabled: canEdit,
  });

  useEffect(() => {
    if (product.data?.product) setForm(formFrom(product.data.product));
  }, [product.data]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/catalogue/products/${id}`, {
        name: form.name.trim(),
        sku: form.sku.trim(),
        categoryId: Number(form.categoryId),
        unit: form.unit.trim() || "unit",
        salesPrice: Number(form.salesPrice),
        cost: Number(form.cost),
        taxRatePct: Number(form.taxRatePct),
        isStockable: form.isStockable,
        defaultBillingType: form.defaultBillingType,
        defaultPlanId:
          form.defaultBillingType === BILLING_TYPE.RECURRING ? form.defaultPlanId || "MONTHLY" : null,
        warrantyMonths: form.warrantyMonths === "" ? null : Number(form.warrantyMonths),
        description: form.description.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast("Product saved");
      setError("");
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  if (product.isLoading || (canEdit && !form)) return <Spinner label="Loading product" />;
  if (product.isError) {
    return <ErrorState message={errorMessage(product.error)} onRetry={product.refetch} />;
  }

  const { product: record, counts } = product.data;
  const isRecurring = (form?.defaultBillingType || record.defaultBillingType) === BILLING_TYPE.RECURRING;

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title={canEdit ? form.name || record.name : record.name}
        subtitle={`${canEdit ? form.sku || record.sku : record.sku} · ${record.category}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {record.isPromoted && <Badge>Promoted</Badge>}
            {canEdit && (
              <Button icon={Save} isLoading={save.isPending} onClick={() => save.mutate()}>
                Save
              </Button>
            )}
            <SmartButtons>
              <SmartButton
                count={counts.quotations}
                label="In quotations"
                icon={FileText}
                to={`/quotations?productId=${record.id}`}
              />
              <SmartButton
                count={counts.warehouses}
                label="Stock"
                icon={Warehouse}
                onClick={() =>
                  document
                    .getElementById("stock-table")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              />
            </SmartButtons>
          </div>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
          {error}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-xl font-semibold text-sand-900">Commercial</h2>
          {canEdit ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Name" htmlFor="product-name" tooltip="How the product appears on quotations, the portal and PDFs.">
                  <Input
                    id="product-name"
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                  />
                </Field>
              </div>
              <Field label="SKU" htmlFor="product-sku" hint="Must be unique." tooltip="Internal code. Used in search and on documents.">
                <Input
                  id="product-sku"
                  value={form.sku}
                  onChange={(event) => set("sku", event.target.value)}
                />
              </Field>
              <Field label="Category" htmlFor="product-category" tooltip="The category ceiling can cap the discount on a line, whichever is stricter with the customer tier.">
                <Select
                  id="product-category"
                  value={form.categoryId}
                  onChange={(event) => set("categoryId", event.target.value)}
                >
                  {(categories.data || []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="List price" htmlFor="product-price" tooltip="Catalogue list price. A price list or variant extra can change what a line actually charges.">
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
              <Field label="Unit" htmlFor="product-unit" tooltip="Printed next to quantity. Does not change how stock is counted.">
                <Input
                  id="product-unit"
                  value={form.unit}
                  onChange={(event) => set("unit", event.target.value)}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Description" htmlFor="product-description" tooltip="A short commercial description. Not used in pricing.">
                  <Textarea
                    id="product-description"
                    rows={3}
                    value={form.description}
                    onChange={(event) => set("description", event.target.value)}
                    placeholder="What this is, in one or two sentences."
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Detail label="List price">{formatMoney(record.salesPrice)}</Detail>
              <Detail label="Cost">{formatMoney(record.cost)}</Detail>
              <Detail label="Margin">{record.marginPct}%</Detail>
              <Detail label="Tax">{record.taxRatePct}%</Detail>
              <Detail label="Unit">{record.unit}</Detail>
              <Detail label="Category ceiling">{record.categoryCeilingPct}%</Detail>
              <div className="sm:col-span-2">
                <Detail label="Description">{record.description || "—"}</Detail>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-xl font-semibold text-sand-900">How it is sold</h2>
          {canEdit ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Billing" htmlFor="product-billing" tooltip="One-time raises an invoice on confirm. Recurring opens a subscription.">
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
                    value={form.defaultPlanId}
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
              <Field label="Warranty months" htmlFor="product-warranty" hint="Leave empty for none." tooltip="Printed on the quotation PDF. Does not create a billing line.">
                <Input
                  id="product-warranty"
                  type="number"
                  min={0}
                  value={form.warrantyMonths}
                  onChange={(event) => set("warrantyMonths", event.target.value)}
                />
              </Field>
              <div className="sm:col-span-2">
                <CheckRow
                  id="product-stockable"
                  label="Stockable"
                  hint="Counted in a warehouse and can run short. Leave off for a service."
                  tooltip="Independent of billing. A rented printer is stockable and recurring; a support plan is neither."
                  checked={form.isStockable}
                  onChange={(value) => set("isStockable", value)}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Detail label="Billing">
                {BILLING_TYPE_LABELS[record.defaultBillingType]}
                {record.defaultPlan && ` · ${record.defaultPlan}`}
              </Detail>
              <Detail label="Stockable">{record.isStockable ? "Yes" : "No"}</Detail>
              <Detail label="Warranty">
                {record.warrantyMonths ? `${record.warrantyMonths} months` : "None included"}
              </Detail>
            </div>
          )}
        </Card>

        <VariantsCard productId={record.id} variants={record.variants} canEdit={canEdit} />

        {record.priceLists.length > 0 && (
          <Card padded={false}>
            <h2 className="border-b border-sand-200 px-6 py-4 text-xl font-semibold text-sand-900">
              Price lists
            </h2>
            <Table>
              <THead>
                <TR>
                  <TH>List</TH>
                  <TH>Tier</TH>
                  <TH align="right">Price</TH>
                </TR>
              </THead>
              <TBody>
                {record.priceLists.map((row) => (
                  <TR key={row.id}>
                    <TD>{row.name}</TD>
                    <TD>{row.tier}</TD>
                    <TD figure align="right">
                      {formatMoney(row.price)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}

        {record.stock.length > 0 && (
          <div id="stock-table" className="scroll-mt-24">
            <Card padded={false}>
              <h2 className="border-b border-sand-200 px-6 py-4 text-xl font-semibold text-sand-900">
                Stock
              </h2>
              <Table>
                <THead>
                  <TR>
                    <TH>Warehouse</TH>
                    <TH align="right">On hand</TH>
                  </TR>
                </THead>
                <TBody>
                  {record.stock.map((row) => (
                    <TR key={row.id}>
                      <TD>{row.warehouse}</TD>
                      <TD figure align="right">
                        {row.qty}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
