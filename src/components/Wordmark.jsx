// The mark: a diamond split down the middle — two sides of a deal, one darker
// than the other. Drawn inline so it needs no image file and picks up the theme
// colours directly.
export function Wordmark({ size = "md", className = "" }) {
  const isLarge = size === "lg";

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        viewBox="0 0 24 24"
        className={isLarge ? "h-7 w-7" : "h-6 w-6"}
        role="img"
        aria-label="DealFlow360"
      >
        <polygon points="12,2 22,12 12,22" className="fill-ink-400" />
        <polygon points="12,2 2,12 12,22" className="fill-ink-700" />
      </svg>
      <span
        className={`font-display font-semibold tracking-tight text-sand-900 ${
          isLarge ? "text-2xl" : "text-lg"
        }`}
      >
        DealFlow360
      </span>
    </span>
  );
}
