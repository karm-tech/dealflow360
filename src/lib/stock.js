// The server has already compared each line against what is on hand, so this
// only gathers the ones it flagged. Rows come out in the same shape as the
// API's stockWarnings, so the confirm dialog can take either source.
export function shortStockLines(lines) {
  return (lines || [])
    .filter((line) => line.isShort)
    .map((line) => ({
      lineId: line.id,
      productId: line.productId,
      productName: line.productName,
      qty: line.qty,
      onHand: line.onHand,
      shortBy: line.qty - line.onHand,
    }));
}
