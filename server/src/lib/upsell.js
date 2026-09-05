// Suggestions are built in two steps.
//
//   1. Candidates — relevance alone decides who is allowed in the list.
//   2. Ranking    — promotion and margin order the products that got through.
//
// Promotion is a multiplier, never an addition, so marking a product promoted
// can reorder relevant suggestions but can never pull an unrelated one in.

import { QUOTATION_STATUS } from "./constants.js";
import { quotationTotals, resolveUnitPrice } from "./pricing.js";

// A product must reach this share of the cart product's past orders to count as
// related at all.
const AFFINITY_THRESHOLD = 0.15;

// An admin pairing is treated as related even before there is history to prove
// it. Real history still outranks the floor once it exists.
const PAIRED_FLOOR = 0.4;

const PROMOTED_MULTIPLIER = 1.2;

const MAX_SUGGESTIONS = 4;

// Share of past orders containing the cart product that also contained the
// candidate. A ratio rather than a count, so a product that appears in every
// order cannot co-occur its way to the top.
function affinity(ordersByProduct, cartProductId, candidateId) {
  const cartOrders = ordersByProduct.get(cartProductId);
  if (!cartOrders || cartOrders.size === 0) return 0;

  const candidateOrders = ordersByProduct.get(candidateId);
  if (!candidateOrders || candidateOrders.size === 0) return 0;

  let shared = 0;
  for (const orderId of cartOrders) {
    if (candidateOrders.has(orderId)) shared += 1;
  }
  return shared / cartOrders.size;
}

// Which past orders each product appeared in. Only confirmed orders count as
// purchase history.
async function buildPurchaseHistory(db) {
  const orders = await db.quotation.findMany({
    where: { status: QUOTATION_STATUS.CONFIRMED },
    select: { id: true, lines: { select: { productId: true } } },
  });

  const ordersByProduct = new Map();
  for (const order of orders) {
    for (const { productId } of order.lines) {
      if (!ordersByProduct.has(productId)) ordersByProduct.set(productId, new Set());
      ordersByProduct.get(productId).add(order.id);
    }
  }
  return ordersByProduct;
}

function parseDismissed(csv) {
  if (!csv) return new Set();
  return new Set(
    csv
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value)),
  );
}

export function addDismissed(csv, productId) {
  const ids = parseDismissed(csv);
  ids.add(productId);
  return [...ids].join(",");
}

// Price this customer would pay, so the margin shown is the margin of what
// would actually be sold.
function priceForCustomer(product, tierId) {
  const items = product.priceListItems.filter(
    (item) => item.priceList.isActive && (!item.priceList.tierId || item.priceList.tierId === tierId),
  );
  const forTier = items.filter((item) => item.priceList.tierId === tierId);
  return resolveUnitPrice(product, forTier.length ? forTier : items);
}

export async function suggestUpsells(db, quotation) {
  const cartProductIds = quotation.lines.map((line) => line.productId);
  if (cartProductIds.length === 0) return [];

  const settings = await db.settings.findUnique({ where: { id: 1 } });
  const minMarginPct = settings?.minUpsellMarginPct ?? 20;

  const [ordersByProduct, rules, products] = await Promise.all([
    buildPurchaseHistory(db),
    db.upsellRule.findMany({ where: { isActive: true, productId: { in: cartProductIds } } }),
    db.product.findMany({
      where: { isActive: true, id: { notIn: cartProductIds } },
      include: { priceListItems: { include: { priceList: true } }, defaultPlan: true },
    }),
  ]);

  const pairedIds = new Set(rules.map((rule) => rule.suggestedProductId));
  const dismissed = parseDismissed(quotation.dismissedUpsellIds);

  // Step 1 — candidates.
  const candidates = [];
  for (const product of products) {
    if (dismissed.has(product.id)) continue;

    const learned = Math.max(
      ...cartProductIds.map((cartId) => affinity(ordersByProduct, cartId, product.id)),
    );
    const isPaired = pairedIds.has(product.id);
    const relevance = isPaired ? Math.max(learned, PAIRED_FLOOR) : learned;

    if (relevance < AFFINITY_THRESHOLD) continue;

    const unitPrice = priceForCustomer(product, quotation.customer.tierId);
    const marginPct = unitPrice > 0 ? ((unitPrice - product.cost) / unitPrice) * 100 : 0;

    // A suggestion that would damage the deal is never shown.
    if (marginPct < Math.max(minMarginPct, product.minMarginPct || 0)) continue;

    candidates.push({ product, unitPrice, relevance, learned, isPaired });
  }

  // Step 2 — ranking.
  const current = quotationTotals(quotation.lines, quotation.orderDiscountPct);

  const ranked = candidates
    .map((candidate) => {
      const trialLine = {
        qty: 1,
        unitPrice: candidate.unitPrice,
        discountPct: 0,
        billingType: candidate.product.defaultBillingType,
        startDate: null,
        product: candidate.product,
        plan: candidate.product.defaultPlan,
      };
      const withCandidate = quotationTotals(
        [...quotation.lines, trialLine],
        quotation.orderDiscountPct,
      );

      return {
        productId: candidate.product.id,
        name: candidate.product.name,
        sku: candidate.product.sku,
        unitPrice: candidate.unitPrice,
        billingType: candidate.product.defaultBillingType,
        isPromoted: candidate.product.isPromoted,
        affinityPct: Math.round(candidate.relevance * 100),
        score: candidate.relevance * (candidate.product.isPromoted ? PROMOTED_MULTIPLIER : 1),
        marginDeltaPoints:
          Math.round((withCandidate.marginPct - current.marginPct) * 10) / 10,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS);

  return ranked;
}
