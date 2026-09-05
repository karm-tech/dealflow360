import { useAuth } from "../app/AuthProvider";

// How the app shows which database you are working in.
//
// Not a banner. A permanent full-width sentence explaining the sandbox is
// shouting the same thing on every page forever — it only needs saying once, at
// the point you enter the demo. What has to survive is the *marker*: something
// you can catch at a glance without it dominating the screen.
//
// So: a thin rail across the top, and a quiet chip in the header. The sentence
// lives in the chip's tooltip, there when someone wants it.

const DEMO_EXPLANATION = "Sample data. Nothing here is saved to live records.";

// The strip sits above the header in normal flow, matching the header's own
// behaviour — both scroll together, so the marker is never orphaned from the
// chip that explains it.
//
// A solid edge plus a tinted strip: enough presence to catch at a glance and to
// survive a screenshot, without the saturated fill and full sentence of an
// alert. The wording stays short because it is on screen permanently.
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

// Names the instance in both modes. Demo gets the plum tint; live gets plain
// greyscale rather than green, because green is `state.ok` and would read as
// "this is healthy" instead of "this is the real database".
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
