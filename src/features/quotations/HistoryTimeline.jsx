import { useEffect, useState } from "react";
import { Card, ListPager } from "../../components/ui";
import { HISTORY_PAGE_SIZE, paginate } from "../../lib/list";

const ACTION_LABELS = {
  QUOTATION_CREATED: "Created",
  QUOTATION_UPDATED: "Changed",
  QUOTATION_CONFIRMED: "Sent for approval",
  QUOTATION_APPROVED: "Approved",
  QUOTATION_RETURNED: "Returned for revision",
  QUOTATION_REJECTED: "Rejected",
  QUOTATION_SENT: "Sent to customer",
  QUOTATION_ACCEPTED: "Accepted",
  QUOTATION_NEGOTIATED: "Customer requested changes",
  QUOTATION_MESSAGE: "Message on the quotation",
  QUOTATION_REJECTED_BY_CUSTOMER: "Turned down by the customer",
  QUOTATION_DUPLICATED: "Duplicated",
  LINE_ADDED: "Line added",
  LINE_UPDATED: "Line changed",
  LINE_REMOVED: "Line removed",
};

function when(value) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Newest first. The same records drive the stall clock, so nothing here is
// written for display alone.
export function HistoryTimeline({ history }) {
  const [page, setPage] = useState(1);
  const firstId = history[0]?.id;
  const windowed = paginate(history, page, HISTORY_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [firstId]);

  return (
    <Card padded={false}>
      <div className="border-b border-sand-200 px-5 py-3.5">
        <h2 className="text-xl font-semibold text-sand-900">History</h2>
      </div>

      {windowed.total === 0 ? (
        <p className="px-5 py-6 text-sm text-sand-600">Nothing has happened on this quotation yet.</p>
      ) : (
        <>
          <ol className="divide-y divide-sand-200">
            {windowed.rows.map((entry) => (
              <li key={entry.id} className="flex gap-3 px-5 py-3">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-200"
                />
                <div className="min-w-0">
                  <p className="text-sm text-sand-900">
                    <span className="font-medium">{ACTION_LABELS[entry.action] || entry.action}</span>
                    {entry.detail && <span className="text-sand-700"> — {entry.detail}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-sand-500">
                    {entry.by} · {when(entry.at)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="px-5 pb-4">
            <ListPager
              {...windowed}
              pageSize={HISTORY_PAGE_SIZE}
              onPage={setPage}
            />
          </div>
        </>
      )}
    </Card>
  );
}
