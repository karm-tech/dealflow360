import { Loader2 } from "lucide-react";

// Four looks, chosen by what the button DOES — not by where it sits:
//   primary    the one action this screen exists for
//   secondary  a real alternative, sitting next to a primary
//   ghost      a minor action, e.g. inside a toolbar or a row
//   danger     something destructive or a decline
//
// Only one primary per screen. If two buttons both feel primary, one of them
// is secondary.
const VARIANTS = {
  primary: "bg-ink-700 text-white hover:bg-ink-800 border border-transparent",
  secondary: "bg-surface text-sand-800 border border-sand-300 hover:bg-sand-50 hover:border-sand-400",
  ghost: "bg-transparent text-sand-700 border border-transparent hover:bg-sand-100",
  danger: "bg-state-bad text-white hover:brightness-110 border border-transparent",
};

const SIZES = {
  sm: "px-2.5 py-1.5 text-sm gap-1.5",
  md: "px-4 py-2 text-base gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  icon: Icon,
  className = "",
  children,
  disabled,
  ...rest
}) {
  return (
    <button
      // Buttons inside a <form> default to submit, which submits by accident.
      // Callers ask for submit explicitly.
      type={rest.type || "button"}
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className="h-4 w-4" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
