import { Card } from "../../components/ui";

const ACTION_LABELS = {
  QUOTATION_CREATED: "Created",
  QUOTATION_UPDATED: "Changed",
  QUOTATION_CONFIRMED: "Confirmed",
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
  return (
    <Card padded={false}>
      <div className="border-b border-sand-200 px-5 py-3.5">
        <h2 className="text-xl font-semibold text-sand-900">History</h2>
      </div>

      {history.length === 0 ? (
        <p className="px-5 py-6 text-sm text-sand-600">Nothing has happened on this quotation yet.</p>
      ) : (
        <ol className="divide-y divide-sand-200">
          {history.map((entry) => (
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
      )}
    </Card>
  );
}
