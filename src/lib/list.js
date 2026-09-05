// Shared list window. The full filtered set still drives the record pager; this
// only slices what the table shows.
export const PAGE_SIZE = 15;

export function pageFromSearch(params) {
  const value = Number(params.get("page"));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

export function paginate(rows, page, pageSize = PAGE_SIZE) {
  const list = rows || [];
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;

  return {
    rows: list.slice(start, start + pageSize),
    page: current,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
    pageSize,
  };
}
