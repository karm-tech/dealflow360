import { FlaskConical } from "lucide-react";
import { useAuth } from "../app/AuthProvider";

// Sits above the navigation on every screen, workspace and portal alike, so
// there is never any doubt about which database is being changed.
//
// Deliberately loud: a deep ochre bar with a bright amber edge. It is the one
// place in the app allowed to shout, because someone who thinks they are in the
// demo while editing live records is the worst thing that can happen here.
export function DemoBanner() {
  const { isDemo } = useAuth();

  if (!isDemo) {
    return null;
  }

  return (
    <div className="border-t-2 border-state-warnBorder bg-state-warn">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-white">
        <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-sm font-medium">
          <span className="font-semibold uppercase tracking-wide">Demo database</span>
          {" — "}
          sample data. Changes here do not affect live records.
        </p>
      </div>
    </div>
  );
}

// Small always-on marker in the header, so live mode is just as obvious as demo
// mode. A blank header would leave people guessing.
export function ModeBadge() {
  const { isDemo } = useAuth();

  const classes = isDemo
    ? "border-state-warnBorder bg-state-warnSoft text-state-warn"
    : "border-state-okBorder bg-state-okSoft text-state-ok";

  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      {isDemo ? "Demo data" : "Live data"}
    </span>
  );
}
