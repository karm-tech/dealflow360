// Reads and writes the warehouse split. The allocation itself lives in
// fulfilment.js; this file only decides when it runs and what it changes.

import { FULFILMENT_STATUS, QUOTATION_STATUS } from "./constants.js";
import { logActivity, logEvent } from "./activity.js";
import { notify, NOTIFICATION_TYPES } from "./notify.js";
import {
  addDays,
  describePlan,
  latestDate,
  planSplit,
  restockWarehouseFor,
  shipmentCost,
  stockableDemands,
} from "./fulfilment.js";

const QUOTATION_FOR_SPLIT = {
  lines: { include: { product: true } },
  customer: true,
  rep: { select: { id: true, name: true, email: true } },
};

// A split is only meaningful once a quotation has been approved.
const SUGGESTABLE = [
  QUOTATION_STATUS.APPROVED,
  QUOTATION_STATUS.SENT,
  QUOTATION_STATUS.UNDER_NEGOTIATION,
  QUOTATION_STATUS.CONFIRMED,
];

export function canSuggest(status) {
  return SUGGESTABLE.includes(status);
}

async function activeWarehouses(db) {
  return db.warehouse.findMany({
    where: { isActive: true },
    include: { stocks: true },
    orderBy: { shippingWeight: "asc" },
  });
}

async function shippingCost(db) {
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  return settings?.defaultShippingCost ?? 250;
}

// References run in one sequence across every shipment. Takes the highest in
// use rather than the newest row, which need not be the highest.
async function nextReferenceNumber(db) {
  const rows = await db.fulfilment.findMany({ select: { reference: true } });

  return rows.reduce((max, row) => {
    const value = Number(String(row.reference || "").replace(/\D/g, ""));
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);
}

export function formatReference(value) {
  return `DF-S-${String(value).padStart(4, "0")}`;
}

async function loadForSplit(db, quotationId) {
  return db.quotation.findUnique({ where: { id: quotationId }, include: QUOTATION_FOR_SPLIT });
}

// Recomputes the suggestion. Nothing is reserved: an abandoned quotation must
// never hold stock.
export async function suggestFulfilment(db, quotationId) {
  const quotation = await loadForSplit(db, quotationId);
  if (!quotation || !canSuggest(quotation.status)) return null;

  const demands = stockableDemands(quotation.lines);

  // Replacing only untouched suggestions keeps an executed split intact.
  await db.fulfilment.deleteMany({
    where: { quotationId, status: FULFILMENT_STATUS.SUGGESTED },
  });

  if (demands.length === 0) {
    await db.quotation.update({ where: { id: quotationId }, data: { estimatedDeliveryDate: null } });
    return { parcels: [], shipmentCount: 0, backorderCount: 0, estimatedDeliveryDate: null };
  }

  const warehouses = await activeWarehouses(db);
  const plan = planSplit(demands, warehouses);
  const described = describePlan(plan, warehouses, await shippingCost(db));

  let sequence = await nextReferenceNumber(db);

  for (const parcel of described.parcels) {
    sequence += 1;
    await db.fulfilment.create({
      data: {
        reference: formatReference(sequence),
        quotationId,
        warehouseId: parcel.warehouseId,
        status: parcel.status,
        shipmentCost: parcel.shipmentCost,
        estDeliveryDate: parcel.estDeliveryDate,
        lines: {
          create: parcel.lines.map((line) => ({
            quotationLineId: line.quotationLineId,
            qty: line.qty,
          })),
        },
      },
    });
  }

  await db.quotation.update({
    where: { id: quotationId },
    data: { estimatedDeliveryDate: described.estimatedDeliveryDate },
  });

  return described;
}

// Takes the stock. Refuses rather than letting a warehouse go negative.
async function deduct(db, warehouseId, productId, qty) {
  const result = await db.stock.updateMany({
    where: { warehouseId, productId, qty: { gte: qty } },
    data: { qty: { decrement: qty } },
  });

  return result.count === 1;
}

// Turns the suggestion into real shipments once the order is agreed.
export async function executeFulfilment(db, mode, quotation, userId) {
  if (quotation.status !== QUOTATION_STATUS.CONFIRMED) {
    return { error: "Only a confirmed order can be fulfilled" };
  }

  const existing = await db.fulfilment.findMany({
    where: { quotationId: quotation.id },
    include: { lines: { include: { quotationLine: true } }, warehouse: true },
  });

  if (existing.some((row) => row.status === FULFILMENT_STATUS.ACCEPTED)) {
    return { error: "This order has already been fulfilled" };
  }

  const suggested = existing.filter((row) => row.status === FULFILMENT_STATUS.SUGGESTED);

  for (const parcel of suggested) {
    for (const line of parcel.lines) {
      const taken = await deduct(db, parcel.warehouseId, line.quotationLine.productId, line.qty);
      if (!taken) {
        return { error: `${parcel.warehouse.name} no longer has enough stock — re-run the split` };
      }
    }

    await db.fulfilment.update({
      where: { id: parcel.id },
      data: { status: FULFILMENT_STATUS.ACCEPTED },
    });
  }

  const backorders = existing.filter((row) => row.status === FULFILMENT_STATUS.BACKORDER);

  await logActivity(db, {
    quotationId: quotation.id,
    userId,
    action: "FULFILMENT_ACCEPTED",
    detail: `${suggested.length} shipment(s) allocated${
      backorders.length ? ` · ${backorders.length} line(s) on backorder` : ""
    }`,
  });

  if (backorders.length > 0 && quotation.rep) {
    await notify(db, mode, {
      users: [quotation.rep],
      type: NOTIFICATION_TYPES.BACKORDER_RAISED,
      title: `${quotation.number} has stock on backorder`,
      body: `${backorders.length} line(s) could not be filled from stock.`,
      quotationId: quotation.id,
    });
  }

  return { shipments: suggested.length, backorders: backorders.length };
}

// Replaces the suggestion with quantities the rep chose. Availability is
// checked here because a browser cannot be trusted to know current stock.
export async function overrideFulfilment(db, quotation, allocations, userId) {
  const lines = quotation.lines.filter((line) => line.product.isStockable);
  const byLineId = new Map(lines.map((line) => [line.id, line]));

  const wantedPerLine = new Map();
  for (const entry of allocations) {
    const line = byLineId.get(entry.quotationLineId);
    if (!line) return { error: "That line is not stocked and cannot be allocated" };
    if (entry.qty < 0) return { error: "Quantity cannot be negative" };

    wantedPerLine.set(line.id, (wantedPerLine.get(line.id) || 0) + entry.qty);
  }

  for (const [lineId, qty] of wantedPerLine) {
    const line = byLineId.get(lineId);
    if (qty > line.qty) {
      return { error: `${line.product.name}: allocated ${qty} but the order is for ${line.qty}` };
    }
  }

  const warehouses = await activeWarehouses(db);
  const byWarehouse = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));

  for (const entry of allocations) {
    if (entry.qty === 0) continue;

    const warehouse = byWarehouse.get(entry.warehouseId);
    if (!warehouse) return { error: "That warehouse does not exist" };

    const line = byLineId.get(entry.quotationLineId);
    const row = warehouse.stocks.find((stock) => stock.productId === line.productId);
    const have = row ? row.qty : 0;

    if (entry.qty > have) {
      return {
        error: `${warehouse.name} has ${have} × ${line.product.name}, not ${entry.qty}`,
      };
    }
  }

  await db.fulfilment.deleteMany({
    where: { quotationId: quotation.id, status: FULFILMENT_STATUS.SUGGESTED },
  });
  await db.fulfilment.deleteMany({
    where: { quotationId: quotation.id, status: FULFILMENT_STATUS.BACKORDER },
  });

  const cost = await shippingCost(db);
  const grouped = new Map();
  for (const entry of allocations) {
    if (entry.qty === 0) continue;
    const list = grouped.get(entry.warehouseId) || [];
    list.push(entry);
    grouped.set(entry.warehouseId, list);
  }

  const dates = [];
  let sequence = await nextReferenceNumber(db);

  for (const [warehouseId, entries] of grouped) {
    const warehouse = byWarehouse.get(warehouseId);
    const estDeliveryDate = addDays(new Date(), warehouse.leadTimeDays);
    dates.push(estDeliveryDate);

    sequence += 1;
    await db.fulfilment.create({
      data: {
        reference: formatReference(sequence),
        quotationId: quotation.id,
        warehouseId,
        status: FULFILMENT_STATUS.SUGGESTED,
        isManualOverride: true,
        shipmentCost: shipmentCost(warehouse, cost),
        estDeliveryDate,
        lines: {
          create: entries.map((entry) => ({
            quotationLineId: entry.quotationLineId,
            qty: entry.qty,
          })),
        },
      },
    });
  }

  // Whatever the rep left unallocated still has to come from somewhere.
  for (const line of lines) {
    const allocated = wantedPerLine.get(line.id) || 0;
    const short = line.qty - allocated;
    if (short <= 0) continue;

    const { warehouse, replenishmentDays } = restockWarehouseFor(line.productId, warehouses);
    const estDeliveryDate = addDays(new Date(), replenishmentDays + warehouse.leadTimeDays);
    dates.push(estDeliveryDate);

    sequence += 1;
    await db.fulfilment.create({
      data: {
        reference: formatReference(sequence),
        quotationId: quotation.id,
        warehouseId: warehouse.id,
        status: FULFILMENT_STATUS.BACKORDER,
        isManualOverride: true,
        shipmentCost: shipmentCost(warehouse, cost),
        estDeliveryDate,
        lines: { create: [{ quotationLineId: line.id, qty: short }] },
      },
    });
  }

  await db.quotation.update({
    where: { id: quotation.id },
    data: { estimatedDeliveryDate: latestDate(dates) },
  });

  await logActivity(db, {
    quotationId: quotation.id,
    userId,
    action: "FULFILMENT_OVERRIDDEN",
    detail: `Split set by hand across ${grouped.size} warehouse(s)`,
  });

  return { ok: true };
}

// Adds stock and reports which backorders it now covers, which is what puts the
// consolidate prompt on screen.
export async function receiveStock(db, { warehouseId, productId, qty, userId }) {
  const existing = await db.stock.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
  });

  if (existing) {
    await db.stock.update({
      where: { id: existing.id },
      data: { qty: { increment: qty } },
    });
  } else {
    await db.stock.create({ data: { warehouseId, productId, qty } });
  }

  const warehouse = await db.warehouse.findUnique({ where: { id: warehouseId } });
  const product = await db.product.findUnique({ where: { id: productId } });

  await logEvent(db, {
    userId,
    action: "STOCK_RECEIVED",
    detail: `${qty} × ${product?.name ?? "item"} into ${warehouse?.name ?? "a warehouse"}`,
  });

  return coverableBackorders(db, productId);
}

// Backorders that current stock could now clear.
//
// Only orders that are already agreed count. Before that nothing has been
// taken from stock, so what looks like spare stock is still earmarked for the
// order's own shipments.
export async function coverableBackorders(db, productId) {
  const backorders = await db.fulfilment.findMany({
    where: {
      status: FULFILMENT_STATUS.BACKORDER,
      quotation: { status: QUOTATION_STATUS.CONFIRMED },
    },
    include: {
      warehouse: true,
      quotation: { select: { id: true, number: true, status: true, repId: true } },
      lines: { include: { quotationLine: { include: { product: true } } } },
    },
  });

  const warehouses = await activeWarehouses(db);
  const covered = [];

  for (const backorder of backorders) {
    const relevant = productId
      ? backorder.lines.filter((line) => line.quotationLine.productId === productId)
      : backorder.lines;
    if (relevant.length === 0) continue;

    const canCover = backorder.lines.every((line) => {
      const total = warehouses.reduce((sum, warehouse) => {
        const row = warehouse.stocks.find((stock) => stock.productId === line.quotationLine.productId);
        return sum + (row ? row.qty : 0);
      }, 0);
      return total >= line.qty;
    });

    if (canCover) covered.push(backorder);
  }

  return covered;
}

// Fills a backorder now that stock has arrived.
export async function consolidateBackorder(db, mode, fulfilmentId, userId) {
  const backorder = await db.fulfilment.findUnique({
    where: { id: fulfilmentId },
    include: {
      warehouse: true,
      quotation: { include: { rep: { select: { id: true, name: true, email: true } } } },
      lines: { include: { quotationLine: { include: { product: true } } } },
    },
  });

  if (!backorder) return { error: "That backorder no longer exists" };
  if (backorder.status !== FULFILMENT_STATUS.BACKORDER) {
    return { error: "That shipment is not on backorder" };
  }
  if (backorder.quotation.status !== QUOTATION_STATUS.CONFIRMED) {
    return { error: "Only a confirmed order can take stock" };
  }

  const warehouses = await activeWarehouses(db);

  for (const line of backorder.lines) {
    const productId = line.quotationLine.productId;

    // Prefer the warehouse the backorder sits against, then anywhere else.
    const ordered = [
      ...warehouses.filter((warehouse) => warehouse.id === backorder.warehouseId),
      ...warehouses.filter((warehouse) => warehouse.id !== backorder.warehouseId),
    ];

    let outstanding = line.qty;
    for (const warehouse of ordered) {
      if (outstanding === 0) break;
      const row = warehouse.stocks.find((stock) => stock.productId === productId);
      const take = Math.min(outstanding, row ? row.qty : 0);
      if (take === 0) continue;

      const taken = await deduct(db, warehouse.id, productId, take);
      if (taken) outstanding -= take;
    }

    if (outstanding > 0) {
      return { error: `Not enough ${line.quotationLine.product.name} in stock yet` };
    }
  }

  await db.fulfilment.update({
    where: { id: backorder.id },
    data: {
      status: FULFILMENT_STATUS.ACCEPTED,
      estDeliveryDate: addDays(new Date(), backorder.warehouse.leadTimeDays),
    },
  });

  const remaining = await db.fulfilment.findMany({
    where: { quotationId: backorder.quotationId },
    select: { estDeliveryDate: true },
  });

  await db.quotation.update({
    where: { id: backorder.quotationId },
    data: { estimatedDeliveryDate: latestDate(remaining.map((row) => row.estDeliveryDate)) },
  });

  await logActivity(db, {
    quotationId: backorder.quotationId,
    userId,
    action: "BACKORDER_CONSOLIDATED",
    detail: `${backorder.lines.length} line(s) filled from ${backorder.warehouse.name}`,
  });

  if (backorder.quotation.rep) {
    await notify(db, mode, {
      users: [backorder.quotation.rep],
      type: NOTIFICATION_TYPES.BACKORDER_CONSOLIDATED,
      title: `${backorder.quotation.number} backorder filled`,
      body: "Stock arrived and the outstanding lines have been allocated.",
      quotationId: backorder.quotationId,
    });
  }

  return { ok: true };
}

// The split as a screen shows it.
export async function fulfilmentView(db, quotationId) {
  const quotation = await db.quotation.findUnique({
    where: { id: quotationId },
    select: {
      id: true,
      number: true,
      status: true,
      requestedDeliveryDate: true,
      estimatedDeliveryDate: true,
    },
  });
  if (!quotation) return null;

  const parcels = await db.fulfilment.findMany({
    where: { quotationId },
    include: {
      warehouse: true,
      lines: { include: { quotationLine: { include: { product: true } } } },
    },
    orderBy: { id: "asc" },
  });

  const view = parcels.map((parcel) => ({
    id: parcel.id,
    warehouseId: parcel.warehouseId,
    warehouse: parcel.warehouse.name,
    status: parcel.status,
    isManualOverride: parcel.isManualOverride,
    shipmentCost: parcel.shipmentCost,
    estDeliveryDate: parcel.estDeliveryDate,
    lines: parcel.lines.map((line) => ({
      quotationLineId: line.quotationLineId,
      product: line.quotationLine.product.name,
      qty: line.qty,
    })),
  }));

  const shipments = view.filter((parcel) => parcel.status !== FULFILMENT_STATUS.BACKORDER);
  const backorders = view.filter((parcel) => parcel.status === FULFILMENT_STATUS.BACKORDER);

  const isLate =
    quotation.requestedDeliveryDate &&
    quotation.estimatedDeliveryDate &&
    new Date(quotation.estimatedDeliveryDate) > new Date(quotation.requestedDeliveryDate);

  return {
    quotationId: quotation.id,
    number: quotation.number,
    status: quotation.status,
    requestedDeliveryDate: quotation.requestedDeliveryDate,
    estimatedDeliveryDate: quotation.estimatedDeliveryDate,
    isLate: Boolean(isLate),
    parcels: view,
    shipmentCount: shipments.length,
    backorderCount: backorders.length,
    totalShippingCost: view.reduce((sum, parcel) => sum + parcel.shipmentCost, 0),
    isExecuted: view.some((parcel) => parcel.status === FULFILMENT_STATUS.ACCEPTED),
  };
}

// One shipment as its own document. Deliberately carries nothing commercial:
// a warehouse operator has no business seeing discounts, margin or approvals.
export async function fulfilmentRecord(db, id) {
  const parcel = await db.fulfilment.findUnique({
    where: { id },
    include: {
      warehouse: true,
      quotation: {
        select: {
          id: true,
          number: true,
          status: true,
          repId: true,
          requestedDeliveryDate: true,
          customer: { select: { id: true, name: true } },
        },
      },
      lines: { include: { quotationLine: { include: { product: true } } } },
    },
  });

  if (!parcel) return null;

  const coverable = await coverableBackorders(db, null);
  const isLate =
    parcel.quotation.requestedDeliveryDate &&
    parcel.estDeliveryDate &&
    new Date(parcel.estDeliveryDate) > new Date(parcel.quotation.requestedDeliveryDate);

  const siblings = await db.fulfilment.count({
    where: { quotationId: parcel.quotationId, status: { not: FULFILMENT_STATUS.RETURNED } },
  });

  // What the whole order has to ship, so the split can be reworked from here.
  // Quantities only: nothing priced belongs on a warehouse document.
  const orderLines = await db.quotationLine.findMany({
    where: { quotationId: parcel.quotationId, product: { isStockable: true } },
    include: { product: { select: { id: true, name: true } } },
    orderBy: { id: "asc" },
  });

  return {
    id: parcel.id,
    reference: parcel.reference,
    status: parcel.status,
    isBackorder: parcel.status === FULFILMENT_STATUS.BACKORDER,
    isManualOverride: parcel.isManualOverride,
    shipmentCost: parcel.shipmentCost,
    estDeliveryDate: parcel.estDeliveryDate,
    requestedDeliveryDate: parcel.quotation.requestedDeliveryDate,
    isLate: Boolean(isLate),
    canConsolidate: coverable.some((row) => row.id === parcel.id),
    warehouse: {
      id: parcel.warehouse.id,
      name: parcel.warehouse.name,
      city: parcel.warehouse.city,
      leadTimeDays: parcel.warehouse.leadTimeDays,
    },
    source: {
      quotationId: parcel.quotation.id,
      number: parcel.quotation.number,
      status: parcel.quotation.status,
      repId: parcel.quotation.repId,
      customerId: parcel.quotation.customer.id,
      customer: parcel.quotation.customer.name,
      shipmentCount: siblings,
    },
    lines: parcel.lines.map((line) => ({
      quotationLineId: line.quotationLineId,
      product: line.quotationLine.product.name,
      sku: line.quotationLine.product.sku,
      ordered: line.quotationLine.qty,
      qty: line.qty,
    })),
    orderLines: orderLines.map((line) => ({
      id: line.id,
      productId: line.product.id,
      productName: line.product.name,
      qty: line.qty,
    })),
  };
}

// Moves a shipment along the only path it can take: allocated, out, arrived.
const NEXT_STATE = {
  [FULFILMENT_STATUS.ACCEPTED]: FULFILMENT_STATUS.SHIPPED,
  [FULFILMENT_STATUS.SHIPPED]: FULFILMENT_STATUS.DELIVERED,
};

export async function validateFulfilment(db, id, userId) {
  const parcel = await db.fulfilment.findUnique({
    where: { id },
    include: { warehouse: true, quotation: { select: { id: true, number: true } } },
  });

  if (!parcel) return { error: "That shipment no longer exists" };

  const next = NEXT_STATE[parcel.status];
  if (!next) {
    return { error: "Only an allocated or shipped parcel can be moved on" };
  }

  await db.fulfilment.update({ where: { id }, data: { status: next } });

  await logActivity(db, {
    quotationId: parcel.quotationId,
    userId,
    action: next === FULFILMENT_STATUS.SHIPPED ? "FULFILMENT_SHIPPED" : "FULFILMENT_DELIVERED",
    detail: `${parcel.reference} from ${parcel.warehouse.name}`,
  });

  return { status: next };
}
