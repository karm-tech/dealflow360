// The penalty weights, kept as JSON text because SQLite has no JSON column.

export const DEFAULT_HEALTH_WEIGHTS = {
  stalledPerDay: 3,
  stalledCap: 30,
  discountAnomaly: 25,
  slippagePerDay: 3,
  slippageCap: 25,
  approvalWaitPerDay: 2,
  approvalWaitCap: 20,
};

// A malformed or half-filled column falls back to the defaults rather than
// throwing: an unreadable weight should cost a deal its score, not the page.
export function readHealthWeights(settings) {
  if (!settings?.healthWeights) return { ...DEFAULT_HEALTH_WEIGHTS };

  try {
    const stored = JSON.parse(settings.healthWeights);
    return { ...DEFAULT_HEALTH_WEIGHTS, ...stored };
  } catch {
    return { ...DEFAULT_HEALTH_WEIGHTS };
  }
}
