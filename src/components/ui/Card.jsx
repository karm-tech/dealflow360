// Border by default; shadow only when the panel genuinely floats.
export function Card({ raised = false, padded = true, className = "", children }) {
  return (
    <div
      className={`rounded-xl border border-sand-200 bg-surface ${
        raised ? "shadow-raised" : "shadow-card"
      } ${padded ? "p-6" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

// Optional heading strip for a card that needs one.
export function CardHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-sand-200 pb-4">
      <div>
        <h2 className="text-xl font-semibold text-sand-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-sand-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
