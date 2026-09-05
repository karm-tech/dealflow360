import { forwardRef } from "react";
import { CircleHelp } from "lucide-react";

// Hover / keyboard help on the label. Kept out of the hint so a short format
// note can sit under the control while the longer explanation stays on demand.
export function FieldHelp({ text }) {
  if (!text) return null;

  return (
    <span className="group/tip relative ml-1 inline-flex align-middle">
      <button
        type="button"
        className="rounded-full text-sand-400 transition-colors hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-500/30"
        aria-label={text}
      >
        <CircleHelp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-[calc(100%+6px)] left-1/2 z-50 w-52 -translate-x-1/2 rounded-md bg-sand-900 px-2.5 py-1.5 text-left text-xs font-normal leading-snug text-white opacity-0 shadow-md group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

// Wraps one control with its label, hint and error. Screens should not
// hand-write a <label>.
export function Field({ label, htmlFor, hint, tooltip, error, children }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="inline-flex items-center text-sm font-medium text-sand-700">
          {label}
          <FieldHelp text={tooltip} />
        </label>
      )}
      {children}
      {/* An error replaces the hint rather than stacking under it. */}
      {error ? (
        <p className="text-xs text-state-bad">{error}</p>
      ) : (
        hint && <p className="text-xs text-sand-600">{hint}</p>
      )}
    </div>
  );
}

// Shared border and focus treatment across every control.
const CONTROL =
  "w-full rounded-lg border bg-surface px-3 py-2 text-base text-sand-900 placeholder:text-sand-400 transition-colors focus:outline-none focus:ring-2 disabled:bg-sand-100 disabled:text-sand-500";

function controlClasses(hasError, extra = "") {
  const state = hasError
    ? "border-state-badBorder focus:border-state-bad focus:ring-state-bad/20"
    : "border-sand-300 hover:border-sand-400 focus:border-ink-500 focus:ring-ink-500/20";
  return `${CONTROL} ${state} ${extra}`;
}

// forwardRef because react-hook-form's register() needs the ref to read the
// value without the component re-rendering on every keystroke.
export const Input = forwardRef(function Input({ hasError, className = "", ...rest }, ref) {
  return <input ref={ref} className={controlClasses(hasError, className)} {...rest} />;
});

export const Select = forwardRef(function Select({ hasError, className = "", children, ...rest }, ref) {
  return (
    <select ref={ref} className={controlClasses(hasError, className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ hasError, className = "", rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={controlClasses(hasError, className)} {...rest} />;
});
