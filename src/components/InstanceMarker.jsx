import { useAuth } from "../app/AuthProvider";

// Shows which database the session is using. Full explanation is in the chip
// tooltip.

const DEMO_EXPLANATION = "Sample data. Nothing here is saved to live records.";

// Sits above the header in normal flow so both scroll together.
export function DemoRail() {
  const { isDemo } = useAuth();

  if (!isDemo) {
    return null;
  }

  return (
    <div className="w-full">
      <div aria-hidden="true" className="h-1 w-full bg-demo" />
      <div className="flex h-7 w-full items-center justify-center border-b border-demo-border bg-demo-soft px-4">
        <span className="text-xs font-medium text-demo">
          Demo data — sample records, not saved to live
        </span>
      </div>
    </div>
  );
}

// Live uses greyscale rather than green: green is `state.ok` and would read as
// a health status.
export function ModeChip() {
  const { isDemo } = useAuth();

  const classes = isDemo
    ? "border-demo-border bg-demo-soft text-demo"
    : "border-sand-200 bg-sand-100 text-sand-600";

  return (
    <span
      title={isDemo ? DEMO_EXPLANATION : undefined}
      className={`rounded-md border px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      {isDemo ? "Demo data" : "Live data"}
    </span>
  );
}
