// Works out which warehouses supply an order: fewest parcels first, then
// cheapest to ship from. Anything no warehouse can cover becomes a backorder.

import { FULFILMENT_STATUS } from "./constants.js";

function stockKey(warehouseId, productId) {
  return `${warehouseId}:${productId}`;
}

// Only stockable products are allocated. A service or a subscription never
// reaches a warehouse.
export function stockableDemands(lines) {
  return lines
    .filter((line) => line.product.isStockable)
    .map((line) => ({
      quotationLineId: line.id,
      productId: line.productId,
      productName: line.product.name,
      qty: line.qty,
    }));
}

// Greedy pass: at each step take the warehouse that covers the most of what is
// left, breaking ties on the cheaper shipping weight. Repeat until nothing more
// can be filled.
export function planSplit(demands, warehouses) {
  const outstanding = demands.map((demand) => ({ ...demand }));

  const available = new Map();
  for (const warehouse of warehouses) {
    for (const row of warehouse.stocks) {
      available.set(stockKey(warehouse.id, row.productId), row.qty);
    }
  }

  const shipments = [];

  while (outstanding.some((demand) => demand.qty > 0)) {
    let best = null;

    for (const warehouse of warehouses) {
      const units = outstanding.reduce((sum, demand) => {
        const have = available.get(stockKey(warehouse.id, demand.productId)) || 0;
        return sum + Math.min(demand.qty, have);
      }, 0);

      if (units === 0) continue;

      const better =
        !best ||
        units > best.units ||
        (units === best.units && warehouse.shippingWeight < best.warehouse.shippingWeight);

      if (better) best = { warehouse, units };
    }

    // Nothing left that any warehouse can supply.
    if (!best) break;

    const lines = [];
    for (const demand of outstanding) {
      const have = available.get(stockKey(best.warehouse.id, demand.productId)) || 0;
      const take = Math.min(demand.qty, have);
      if (take === 0) continue;

      lines.push({
        quotationLineId: demand.quotationLineId,
        productId: demand.productId,
        productName: demand.productName,
        qty: take,
      });
      available.set(stockKey(best.warehouse.id, demand.productId), have - take);
      demand.qty -= take;
    }

    shipments.push({ warehouseId: best.warehouse.id, lines });
  }

  const backorder = outstanding
    .filter((demand) => demand.qty > 0)
    .map((demand) => ({
      quotationLineId: demand.quotationLineId,
      productId: demand.productId,
      productName: demand.productName,
      qty: demand.qty,
    }));

  return { shipments, backorder };
}

// A backorder still belongs somewhere: the warehouse that restocks this product
// soonest, so the expected date means something.
export function restockWarehouseFor(productId, warehouses) {
  const candidates = warehouses
    .map((warehouse) => ({
      warehouse,
      row: warehouse.stocks.find((stock) => stock.productId === productId),
    }))
    .filter((entry) => entry.row);

  if (candidates.length === 0) return { warehouse: warehouses[0], replenishmentDays: 14 };

  candidates.sort((a, b) => {
    const days = a.row.replenishmentDays - b.row.replenishmentDays;
    return days !== 0 ? days : a.warehouse.shippingWeight - b.warehouse.shippingWeight;
  });

  return {
    warehouse: candidates[0].warehouse,
    replenishmentDays: candidates[0].row.replenishmentDays,
  };
}

export function addDays(from, days) {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date;
}

// One parcel from one warehouse, priced off that warehouse's shipping weight.
export function shipmentCost(warehouse, defaultShippingCost) {
  return Math.round(defaultShippingCost * warehouse.shippingWeight);
}

// Latest arrival across every parcel, including anything still on backorder.
export function latestDate(dates) {
  const valid = dates.filter(Boolean).map((date) => new Date(date).getTime());
  return valid.length === 0 ? null : new Date(Math.max(...valid));
}

// Turns the plan into rows ready to write, with a cost and an arrival date on
// each parcel.
export function describePlan({ shipments, backorder }, warehouses, defaultShippingCost, today = new Date()) {
  const byId = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));

  const parcels = shipments.map((shipment) => {
    const warehouse = byId.get(shipment.warehouseId);
    return {
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      status: FULFILMENT_STATUS.SUGGESTED,
      shipmentCost: shipmentCost(warehouse, defaultShippingCost),
      estDeliveryDate: addDays(today, warehouse.leadTimeDays),
      lines: shipment.lines,
    };
  });

  const backorders = [];
  for (const item of backorder) {
    const { warehouse, replenishmentDays } = restockWarehouseFor(item.productId, warehouses);

    // Restock first, then the normal journey out.
    const estDeliveryDate = addDays(today, replenishmentDays + warehouse.leadTimeDays);

    backorders.push({
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      status: FULFILMENT_STATUS.BACKORDER,
      shipmentCost: shipmentCost(warehouse, defaultShippingCost),
      estDeliveryDate,
      lines: [item],
    });
  }

  const all = [...parcels, ...backorders];

  return {
    parcels: all,
    shipmentCount: parcels.length,
    backorderCount: backorders.length,
    totalShippingCost: all.reduce((sum, parcel) => sum + parcel.shipmentCost, 0),
    estimatedDeliveryDate: latestDate(all.map((parcel) => parcel.estDeliveryDate)),
  };
}
