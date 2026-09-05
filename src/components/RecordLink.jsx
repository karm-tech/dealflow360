import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

// A related record opens from wherever it is named, so a customer or product on
// a quotation is a way through to that record rather than plain text.
export function RecordLink({ to, children, className = "" }) {
  return (
    <Link
      to={to}
      className={`group inline-flex items-center gap-0.5 font-medium text-ink-700 hover:underline ${className}`}
    >
      {children}
      <ArrowUpRight
        className="h-3.5 w-3.5 shrink-0 text-ink-400 transition-colors group-hover:text-ink-700"
        aria-hidden="true"
      />
    </Link>
  );
}
