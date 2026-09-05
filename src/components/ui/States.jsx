import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Button } from "./Button";

// Loading, error and empty states, shared so they never look ad hoc.

export function Spinner({ label = "Loading" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-sand-600">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <p className="text-sm">{label}…</p>
    </div>
  );
}

// Always says what to do next, not just that something went wrong.
export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-state-badBorder bg-state-badSoft px-6 py-10 text-center">
      <AlertTriangle className="h-5 w-5 text-state-bad" aria-hidden="true" />
      <p className="max-w-md text-sm text-state-bad">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// The hint should say how the first row gets here.
export function EmptyState({ title, hint, action }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-sand-300 bg-sand-50 px-6 py-14 text-center">
      <Inbox className="h-5 w-5 text-sand-400" aria-hidden="true" />
      <p className="font-medium text-sand-800">{title}</p>
      {hint && <p className="max-w-sm text-sm text-sand-600">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
