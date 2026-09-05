import { forwardRef } from "react";

// Wraps one control with its label, hint and error. Screens should not
// hand-write a <label>.
//
//   <Field label="Email" error={errors.email?.message}>
//     <Input id="email" {...register("email")} />
//   </Field>
export function Field({ label, htmlFor, hint, error, children }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-sand-700">
          {label}
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
