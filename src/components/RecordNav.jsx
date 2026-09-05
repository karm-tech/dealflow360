import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "./ui";

// The way back to the list, and a step through the records either side.
//
// The filters the list was using travel in the address bar, so the pager walks
// the same sequence the table was showing and a pasted link still works.
export function RecordNav({ listLabel, listTo, recordId, neighboursPath, recordTo }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const search = params.toString();

  const neighbours = useQuery({
    queryKey: ["neighbours", neighboursPath, recordId, search],
    enabled: Boolean(neighboursPath && recordId),
    queryFn: async () =>
      (await api.get(neighboursPath, { params: Object.fromEntries(params) })).data,
  });

  const { prevId, nextId, position, total } = neighbours.data || {};

  function go(id) {
    navigate(`${recordTo(id)}${search ? `?${search}` : ""}`);
  }

  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <nav aria-label="Breadcrumb" className="text-sm text-sand-600">
        <Link to={`${listTo}${search ? `?${search}` : ""}`} className="hover:text-ink-700 hover:underline">
          {listLabel}
        </Link>
        <span aria-hidden="true" className="mx-1.5 text-sand-400">
          ›
        </span>
        <span className="text-sand-900">{recordId}</span>
      </nav>

      {position && total > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronLeft}
            aria-label="Previous record"
            disabled={!prevId}
            onClick={() => go(prevId)}
            className="!px-1.5"
          />
          <span className="figure text-xs text-sand-600">
            {position} / {total}
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronRight}
            aria-label="Next record"
            disabled={!nextId}
            onClick={() => go(nextId)}
            className="!px-1.5"
          />
        </div>
      )}
    </div>
  );
}
