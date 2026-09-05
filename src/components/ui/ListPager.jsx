import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { PAGE_SIZE } from "../../lib/list";

// Hidden while everything fits on one page, so a short list does not grow a
// footer it does not need.
export function ListPager({ page, pageCount, total, from, to, onPage, pageSize = PAGE_SIZE }) {
  if (total <= pageSize) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-sand-600">
      <p className="figure">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          icon={ChevronLeft}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          Previous
        </Button>
        <span className="figure px-2 text-xs">
          {page} / {pageCount}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
