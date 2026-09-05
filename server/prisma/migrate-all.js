// Applies the migrations to BOTH databases — live and demo.
//
// Prisma reads one DATABASE_URL from the environment, so it can only migrate a
// single file per run. This script runs it twice, handing it a different URL
// each time.
//
// It is a Node script rather than a line in package.json because PowerShell has
// no `VAR=value command` syntax, and Karm is on Windows. Node sets the variable
// the same way on every platform.
//
// Run with:  npm run migrate:all

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
