import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { INTERNAL_ROLES, ROLES, FULFILMENT_STATUS } from "../lib/constants.js";
import {
  canSuggest,
  consolidateBackorder,
  coverableBackorders,
  fulfilmentView,
  overrideFulfilment,
  receiveStock,
  suggestFulfilment,
} from "../lib/fulfilmentService.js";

export const fulfilmentRouter = Router();

fulfilmentRouter.use(requireAuth, requireRole(...INTERNAL_ROLES));

const overrideSchema = z.object({
  allocations: z.array(
    z.object({
      quotationLineId: z.number().int().positive(),
      warehouseId: z.number().int().positive(),
      qty: z.number().int().min(0),
    }),
  ),
});

const receiptSchema = z.object({
  warehouseId: z.number().int().positive("Choose a warehouse"),
  productId: z.number().int().positive("Choose a product"),
  qty: z.number().int().min(1, "Receive at least one unit"),
});

// Everything still to go out, across every order.
fulfilmentRouter.get("/", async (req, res) => {
  const parcels = await req.db.fulfilment.findMany({
    where: { status: { in: [FULFILMENT_STATUS.SUGGESTED, FULFILMENT_STATUS.ACCEPTED, FULFILMENT_STATUS.BACKORDER] } },
    include: {
      warehouse: true,
      quotation: { include: { customer: { select: { name: true } } } },
      lines: { include: { quotationLine: { include: { product: { select: { name: true } } } } } },
    },
    orderBy: [{ status: "asc" }, { estDeliveryDate: "asc" }],
  });

  const rows = parcels.map((parcel) => ({
    id: parcel.id,
    status: parcel.status,
    warehouse: parcel.warehouse.name,
    quotationId: parcel.quotationId,
    number: parcel.quotation.number,
    customer: parcel.quotation.customer.name,
    estDeliveryDate: parcel.estDeliveryDate,
    requestedDeliveryDate: parcel.quotation.requestedDeliveryDate,
    isLate:
      parcel.quotation.requestedDeliveryDate &&
      parcel.estDeliveryDate &&
      new Date(parcel.estDeliveryDate) > new Date(parcel.quotation.requestedDeliveryDate),
    shipmentCost: parcel.shipmentCost,
    lines: parcel.lines.map((line) => ({
      product: line.quotationLine.product.name,
      qty: line.qty,
    })),
  }));

  const coverable = await coverableBackorders(req.db, null);

  res.json({ parcels: rows, consolidatableIds: coverable.map((row) => row.id) });
});

// The split for one order, plus whether any backorder can now be filled.
fulfilmentRouter.get("/quotation/:id", async (req, res) => {
  const view = await fulfilmentView(req.db, Number(req.params.id));
  if (!view) return res.status(404).json({ error: "That quotation no longer exists" });

  const coverable = await coverableBackorders(req.db, null);
  const ids = new Set(coverable.map((row) => row.id));

  view.parcels = view.parcels.map((parcel) => ({
    ...parcel,
    canConsolidate: ids.has(parcel.id),
  }));

  res.json({ fulfilment: view });
});

fulfilmentRouter.post("/quotation/:id/suggest", async (req, res) => {
  const id = Number(req.params.id);
  const quotation = await req.db.quotation.findUnique({ where: { id }, select: { status: true } });
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  if (!canSuggest(quotation.status)) {
    return res.status(409).json({ error: "A split is only suggested once a quotation is approved" });
  }

  await suggestFulfilment(req.db, id);
  res.json({ fulfilment: await fulfilmentView(req.db, id) });
});

fulfilmentRouter.post("/quotation/:id/override", async (req, res) => {
  const parsed = overrideSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const id = Number(req.params.id);
  const quotation = await req.db.quotation.findUnique({
    where: { id },
    include: { lines: { include: { product: true } } },
  });
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  if (!canSuggest(quotation.status)) {
    return res.status(409).json({ error: "A split can only be changed once a quotation is approved" });
  }

  const executed = await req.db.fulfilment.count({
    where: { quotationId: id, status: FULFILMENT_STATUS.ACCEPTED },
  });
  if (executed > 0) {
    return res.status(409).json({ error: "This order has already been fulfilled" });
  }

  const result = await overrideFulfilment(req.db, quotation, parsed.data.allocations, req.user.id);
  if (result.error) return res.status(409).json({ error: result.error });

  res.json({ fulfilment: await fulfilmentView(req.db, id) });
});

fulfilmentRouter.post("/:id/consolidate", async (req, res) => {
  const result = await consolidateBackorder(req.db, req.dbMode, Number(req.params.id), req.user.id);
  if (result.error) return res.status(409).json({ error: result.error });

  res.json({ ok: true });
});

// Receiving stock is what makes a backorder fillable, so it belongs with
// fulfilment rather than in the catalogue.
fulfilmentRouter.post("/stock/receive", requireRole(ROLES.ADMIN), async (req, res) => {
  const parsed = receiptSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { warehouseId, productId, qty } = parsed.data;

  const warehouse = await req.db.warehouse.findUnique({ where: { id: warehouseId } });
  if (!warehouse) return res.status(404).json({ error: "That warehouse does not exist" });

  const product = await req.db.product.findUnique({ where: { id: productId } });
  if (!product) return res.status(404).json({ error: "That product does not exist" });
  if (!product.isStockable) {
    return res.status(400).json({ error: `${product.name} is not stocked` });
  }

  const covered = await receiveStock(req.db, { warehouseId, productId, qty, userId: req.user.id });

  res.json({
    received: qty,
    message: `${qty} × ${product.name} received into ${warehouse.name}`,
    consolidatable: covered.map((row) => ({
      id: row.id,
      number: row.quotation.number,
      quotationId: row.quotationId,
    })),
  });
});

// Stock on hand, for the receipt form and the warehouse view.
fulfilmentRouter.get("/stock", async (req, res) => {
  const warehouses = await req.db.warehouse.findMany({
    where: { isActive: true },
    include: {
      stocks: { include: { product: { select: { id: true, name: true, sku: true } } } },
    },
    orderBy: { name: "asc" },
  });

  res.json({
    warehouses: warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      city: warehouse.city,
      leadTimeDays: warehouse.leadTimeDays,
      shippingWeight: warehouse.shippingWeight,
      stock: warehouse.stocks
        .map((row) => ({
          productId: row.productId,
          product: row.product.name,
          sku: row.product.sku,
          qty: row.qty,
          reorderLevel: row.reorderLevel,
          isLow: row.qty <= row.reorderLevel,
        }))
        .sort((a, b) => a.product.localeCompare(b.product)),
    })),
  });
});
