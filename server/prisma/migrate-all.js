// Applies migrations to both databases. Prisma reads a single DATABASE_URL per
// run, so this runs it twice with a different URL each time.
//
// A Node script rather than an npm one-liner because PowerShell has no
// `VAR=value command` syntax.

import "dotenv/config";
import { spawnSync } from "node:child_process";

const targets = [
  { label: "live", url: process.env.DATABASE_URL || "file:./dev.db" },
  { label: "demo", url: process.env.DEMO_DATABASE_URL || "file:./demo.db" },
];

for (const target of targets) {
  console.log(`\nMigrating ${target.label} database (${target.url})`);

  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    shell: true, // needed so `npx` resolves on Windows
    env: { ...process.env, DATABASE_URL: target.url },
  });

  if (result.status !== 0) {
    console.error(`Migrating the ${target.label} database failed.`);
    process.exit(result.status || 1);
  }
}

console.log("\nBoth databases are up to date.");
