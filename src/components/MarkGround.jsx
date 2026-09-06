// Same diamond as the wordmark, scaled into the page so / and /login share a ground.

export function MarkGround({ children, className = "" }) {
  return (
    <div className={`relative overflow-hidden bg-canvas ${className}`}>
      <div className="mark-wash pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="mark-lattice pointer-events-none absolute inset-0" aria-hidden="true" />
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute -right-16 top-20 h-[26rem] w-[26rem] text-ink-100 opacity-70"
        aria-hidden="true"
      >
        <polygon points="12,2 22,12 12,22" className="fill-ink-200/40" />
        <polygon points="12,2 2,12 12,22" className="fill-ink-400/25" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute -left-20 bottom-8 h-72 w-72 text-ink-100 opacity-50"
        aria-hidden="true"
      >
        <polygon points="12,2 22,12 12,22" className="fill-ink-200/30" />
        <polygon points="12,2 2,12 12,22" className="fill-ink-400/20" />
      </svg>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
