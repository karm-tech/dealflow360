// Numbers run in one sequence and never change: a quotation keeps its number
// when it becomes an order, and a renewal takes the next one like any other.
// Takes the highest number in use rather than the newest row, which need not be
// the highest.

export async function nextQuotationNumber(db) {
  const rows = await db.quotation.findMany({ select: { number: true } });

  const highest = rows.reduce((max, row) => {
    const value = Number(row.number.replace(/\D/g, ""));
    return Number.isFinite(value) && value > max ? value : max;
  }, 1000);

  return `DF-Q-${highest + 1}`;
}
