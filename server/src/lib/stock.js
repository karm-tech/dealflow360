// Availability is summed across every warehouse. Which warehouse supplies a
// line is decided later by the split, so a shortage only means something
// against the total on hand.

export function onHandQty(product) {
  const stocks = product.stocks || [];
  return stocks.reduce((sum, row) => sum + row.qty, 0);
}

// Only stockable lines can be short; a service or a subscription never reaches
// a warehouse. The rows are shaped the way the browser needs them, so the
// warning on the line and the one in the confirm dialog read the same figures.
export function shortStockLines(lines) {
  return lines
    .filter((line) => line.product.isStockable)
    .map((line) => {
      const onHand = onHandQty(line.product);
      return {
        lineId: line.id,
        productId: line.productId,
        productName: line.product.name,
        qty: line.qty,
        onHand,
        shortBy: line.qty - onHand,
      };
    })
    .filter((row) => row.shortBy > 0);
}
