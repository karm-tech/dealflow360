import { Link } from "react-router-dom";

// Related records reachable from a form. The count leads, because it is what
// the reader is looking for.
export function SmartButtons({ children }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

const BASE =
  "flex min-w-[7rem] flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left";

// A count of zero stays on screen but inert, so the form keeps its shape from
// one record to the next.
export function SmartButton({ count = 0, label, to, onClick, icon: Icon }) {
  const isEmpty = !count;

  const classes = isEmpty
    ? `${BASE} cursor-default border-sand-200 bg-sand-50`
    : `${BASE} border-sand-300 bg-surface transition hover:border-ink-400 hover:bg-ink-50`;

  const body = (
    <>
      <span
        className={`figure text-lg font-semibold leading-none ${
          isEmpty ? "text-sand-400" : "text-ink-700"
        }`}
      >
        {count}
      </span>
      <span
        className={`flex items-center gap-1 text-xs font-medium ${
          isEmpty ? "text-sand-400" : "text-sand-700"
        }`}
      >
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
        {label}
      </span>
    </>
  );

  if (isEmpty) {
    return (
      <span className={classes} aria-disabled="true">
        {body}
      </span>
    );
  }

  if (to) {
    return (
      <Link to={to} className={classes}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {body}
    </button>
  );
}
