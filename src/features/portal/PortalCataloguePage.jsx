import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, RefreshCw } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  ListPager,
  SearchField,
  Select,
  Spinner,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { paginate } from "../../lib/list";
import { useBasket } from "./BasketProvider";

// The quantity is chosen here rather than after adding, so one action puts a
// fully specified line in the basket.
function ProductRow({ product, onAdd }) {
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState("");
  const [justAdded, setJustAdded] = useState(false);
  const variants = product.variants || [];
  const variant = variants.find((row) => String(row.id) === variantId) || null;
  const price = product.price + (variant?.extraPrice || 0);

  function handleAdd() {
    if (variants.length > 0 && !variant) return;
    onAdd(product, qty, variant);
    setQty(1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-sand-200 px-4 py-3 last:border-0">
      <div className="min-w-48 flex-1">
        <p className="text-base font-medium text-sand-900">{product.name}</p>
        <p className="figure mt-0.5 text-xs text-sand-600">
          {product.sku} · {product.category}
        </p>
        {product.description && (
          <p className="mt-1 text-sm text-sand-600">{product.description}</p>
        )}
      </div>

      {variants.length > 0 && (
        <Select
          value={variantId}
          aria-label={`Variant of ${product.name}`}
          onChange={(event) => setVariantId(event.target.value)}
          className="!w-44"
        >
          <option value="">Choose variant…</option>
          {variants.map((row) => (
            <option key={row.id} value={row.id}>
              {row.attribute}: {row.value}
              {row.extraPrice ? ` (+${formatMoney(row.extraPrice)})` : ""}
            </option>
          ))}
        </Select>
      )}

      {product.billingType === "RECURRING" && (
        <Badge className="gap-1 font-normal">
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          {product.planName || "Recurring"}
        </Badge>
      )}

      <p className="figure w-28 text-right text-base text-sand-900">
        {formatMoney(price)}
        <span className="block text-xs text-sand-500">per {product.unit}</span>
      </p>

      <input
        type="number"
        min={1}
        value={qty}
        aria-label={`Quantity of ${product.name}`}
        onChange={(event) => setQty(Math.max(1, Number(event.target.value) || 1))}
        className="figure w-16 rounded-lg border border-sand-300 px-2 py-1.5 text-right text-sm focus:border-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-100"
      />

      <Button
        size="sm"
        variant={justAdded ? "secondary" : "primary"}
        icon={justAdded ? Check : Plus}
        disabled={variants.length > 0 && !variantId}
        onClick={handleAdd}
      >
        {justAdded ? "Added" : "Add"}
      </Button>
    </li>
  );
}

export function PortalCataloguePage() {
  const toast = useToast();
  const { add } = useBasket();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);

  const categories = useQuery({
    queryKey: ["portal-categories"],
    queryFn: async () => (await api.get("/portal/categories")).data.categories,
  });

  const products = useQuery({
    queryKey: ["portal-products", search, categoryId],
    queryFn: async () =>
      (
        await api.get("/portal/products", {
          params: {
            ...(search ? { q: search } : {}),
            ...(categoryId ? { categoryId } : {}),
          },
        })
      ).data.products,
    placeholderData: (previous) => previous,
  });

  function handleAdd(product, qty, variant) {
    add(product, qty, variant);
    toast(`${product.name} × ${qty} added to your request`);
  }

  function changeFilter(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  const windowed = products.data ? paginate(products.data, page) : null;

  return (
    <div className="animate-fadeUp">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-sand-900">What can we quote for you?</h1>
        <p className="mt-1 text-base text-sand-600">
          Prices shown are yours. Add what you need, then send it over and we will come back with a
          full quotation.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="portal-search" tooltip="Matches product name or SKU in the catalogue you can request.">
          <SearchField
            id="portal-search"
            value={search}
            onChange={changeFilter(setSearch)}
            placeholder="Product name or code"
          />
        </Field>

        <Field label="Category" htmlFor="portal-category" tooltip="Narrows the catalogue. Prices shown are already your tier.">
          <Select
            id="portal-category"
            value={categoryId}
            onChange={(event) => changeFilter(setCategoryId)(event.target.value)}
            className="!w-48"
          >
            <option value="">All categories</option>
            {(categories.data || []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {products.isLoading && <Spinner label="Loading the catalogue" />}

      {products.isError && (
        <ErrorState message={errorMessage(products.error)} onRetry={products.refetch} />
      )}

      {products.data && products.data.length === 0 && (
        <EmptyState
          title="Nothing matches that"
          hint="Try a shorter search, or clear the category filter."
        />
      )}

      {windowed && windowed.total > 0 && (
        <>
          <ul className="rounded-xl border border-sand-200 bg-surface shadow-card">
            {windowed.rows.map((product) => (
              <ProductRow key={product.id} product={product} onAdd={handleAdd} />
            ))}
          </ul>

          <ListPager {...windowed} onPage={setPage} />
        </>
      )}
    </div>
  );
}
