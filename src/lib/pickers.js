// Turns catalogue records into the shape RecordPicker renders, so a customer
// or a product looks the same wherever it is picked.

import { api } from "./api";
import { formatMoney } from "./format";

const LIMIT = 20;

export function customerOption(customer) {
  if (!customer) return null;
  return {
    id: customer.id,
    label: customer.name,
    hint: customer.email,
    meta: customer.tier,
    record: customer,
  };
}

export async function searchCustomers(q) {
  const { data } = await api.get("/catalogue/customers", { params: { q: q || undefined, limit: LIMIT } });
  return data.customers.map(customerOption);
}

export function productOption(product) {
  if (!product) return null;
  return {
    id: product.id,
    label: product.name,
    hint: product.isStockable
      ? `${product.category} · ${product.onHand ?? 0} on hand`
      : `${product.category} · up to ${product.categoryCeilingPct}% discount`,
    meta: formatMoney(product.price),
    record: product,
  };
}

export function searchProducts(tierId) {
  return async (q) => {
    const { data } = await api.get("/catalogue/products", {
      params: { q: q || undefined, limit: LIMIT, tierId },
    });
    return data.products.map(productOption);
  };
}
