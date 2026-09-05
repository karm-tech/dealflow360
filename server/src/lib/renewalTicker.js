// Runs the renewal sweep on a timer so a renewal appears without anyone
// clicking. There is no scheduler on the machines this runs on, so the interval
// lives in the process; the same sweep is exposed as a route for running it on
// demand.

import { DB_MODES } from "./constants.js";
import { dbForMode } from "./prisma.js";
import { runRenewals } from "./renewalService.js";

const EVERY_MS = 60 * 60 * 1000;

async function sweep() {
  for (const mode of [DB_MODES.LIVE, DB_MODES.DEMO]) {
    try {
      const { raised } = await runRenewals(dbForMode(mode), mode);
      for (const entry of raised) {
        console.log(`[renewals] ${mode}: ${entry.number} renews ${entry.subscriptionReference}`);
      }
    } catch (error) {
      // A failed sweep must not take the API down; the next one tries again.
      console.error(`[renewals] ${mode} sweep failed:`, error.message);
    }
  }
}

export function startRenewalTicker() {
  sweep();
  const timer = setInterval(sweep, EVERY_MS);
  // Lets the process exit on its own during tests and restarts.
  timer.unref();
  return timer;
}
