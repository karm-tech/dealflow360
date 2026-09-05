import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { INTERNAL_ROLES } from "../lib/constants.js";
import { resolveUnitPrice } from "../lib/pricing.js";
import { quotationSummary, QUOTATION_INCLUDE } from "../lib/quotationView.js";

export const catalogueRouter = Router();

// Cost and margin appear on these responses, so the whole router is staff only.
catalogueRouter.use(requireAuth, requireRole(...INTERNAL_ROLES));

function marginPct(price, cost) {
  if (!price) return 0;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

catalogueRouter.get("/products", async (req, res) => {
  const tierId = req.query.tierId ? String(req.query.tierId) : null;

  const products = await req.db.product.findMany({
    where: { isActive: true },
    include: { category: true, priceListItems: { include: { priceList: true } }, defaultPlan: true },
    orderBy: [{ categoryId: "asc" }, { name: "asc" }],
  });

  res.json({
    products: products.map((product) => {
      const usable = product.priceListItems.filter(
        (item) => item.priceList.isActive && (!item.priceList.tierId || item.priceList.tierId === tierId),
      );
      const forTier = usable.filter((item) => item.priceList.tierId === tierId);
      const price = resolveUnitPrice(product, forTier.length ? forTier : usable);

      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category.name,
        categoryCeilingPct: product.category.discountCeilingPct,
        unit: product.unit,
        price,
        listPrice: product.salesPrice,
        taxRatePct: product.taxRatePct,
        defaultBillingType: product.defaultBillingType,
        defaultPlanId: product.defaultPlanId,
        isStockable: product.isStockable,
        isPromoted: product.isPromoted,
      };
    }),
  });
});

catalogueRouter.get("/products/:id", async (req, res) => {
  const product = await req.db.product.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      category: true,
      defaultPlan: true,
      variants: true,
      priceListItems: { include: { priceList: { include: { tier: true } } } },
      stocks: { include: { warehouse: true } },
    },
  });

  if (!product) return res.status(404).json({ error: "That product no longer exists" });

  res.json({
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category.name,
      categoryCeilingPct: product.category.discountCeilingPct,
      unit: product.unit,
      salesPrice: product.salesPrice,
      cost: product.cost,
      marginPct: marginPct(product.salesPrice, product.cost),
      taxRatePct: product.taxRatePct,
      defaultBillingType: product.defaultBillingType,
      defaultPlan: product.defaultPlan ? product.defaultPlan.name : null,
      isStockable: product.isStockable,
      isReturnable: product.isReturnable,
      isPromoted: product.isPromoted,
      warrantyMonths: product.warrantyMonths,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        attribute: variant.attribute,
        value: variant.value,
        extraPrice: variant.extraPrice,
      })),
      priceLists: product.priceListItems.map((item) => ({
        id: item.id,
        name: item.priceList.name,
        tier: item.priceList.tier ? item.priceList.tier.name : "All tiers",
        price: item.price,
      })),
      stock: product.stocks.map((row) => ({
        id: row.id,
        warehouse: row.warehouse.name,
        qty: row.qty,
      })),
    },
  });
});

catalogueRouter.get("/customers", async (req, res) => {
  const customers = await req.db.customer.findMany({
    where: { isActive: true },
    include: { tier: true },
    orderBy: { name: "asc" },
  });

  res.json({
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      city: customer.city,
      tierId: customer.tierId,
      tier: customer.tier.name,
      maxDiscountPct: customer.tier.maxDiscountPct,
    })),
  });
});

catalogueRouter.get("/customers/:id", async (req, res) => {
  const customer = await req.db.customer.findUnique({
    where: { id: Number(req.params.id) },
    include: { tier: true },
  });

  if (!customer) return res.status(404).json({ error: "That customer no longer exists" });

  const quotations = await req.db.quotation.findMany({
    where: { customerId: customer.id },
    include: QUOTATION_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  res.json({
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      city: customer.city,
      state: customer.state,
      tier: customer.tier.name,
      maxDiscountPct: customer.tier.maxDiscountPct,
      createdAt: customer.createdAt,
    },
    quotations: quotations.map(quotationSummary),
  });
});

catalogueRouter.get("/plans", async (req, res) => {
  const plans = await req.db.recurringPlan.findMany({ orderBy: { name: "asc" } });
  res.json({ plans: plans.map((plan) => ({ id: plan.id, name: plan.name })) });
});
