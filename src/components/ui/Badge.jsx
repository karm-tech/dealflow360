// Badge is a neutral label: a tier, a role, a count. StatusPill carries health.
// Only StatusPill may use the state colours.

export function Badge({ className = "", children }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border border-sand-200 bg-sand-100 px-2 py-0.5 text-xs font-medium text-sand-700 ${className}`}
    >
      {children}
    </span>
  );
}

const TONES = {
  ok: "bg-state-okSoft text-state-ok border-state-okBorder",
  warn: "bg-state-warnSoft text-state-warn border-state-warnBorder",
  bad: "bg-state-badSoft text-state-bad border-state-badBorder",
  // For a status that carries no judgement, e.g. Draft.
  neutral: "bg-sand-100 text-sand-700 border-sand-200",
  // For a status that is simply work in progress, e.g. Sent.
  info: "bg-ink-50 text-ink-700 border-ink-200",
};

export function StatusPill({ tone = "neutral", className = "", children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
