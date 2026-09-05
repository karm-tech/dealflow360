// A variant is an extra price on top of the product's list price, not a
// different product. The line stores the chosen one so a later catalogue
// change does not rewrite what was sold.

export function variantLabel(variant) {
  if (!variant) return null;
  return `${variant.attribute}: ${variant.value}`;
}

export function applyVariantPrice(basePrice, variant) {
  return Math.round((basePrice + (variant?.extraPrice || 0) + Number.EPSILON) * 100) / 100;
}
