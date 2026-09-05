// Money and date helpers, so formatting is defined in one place.

export function formatMoney(amount, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Relative wording where elapsed time matters more than the date itself.
export function daysSince(value) {
  if (!value) return null;
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const diff = Date.now() - new Date(value).getTime();
  return Math.floor(diff / millisecondsPerDay);
}
