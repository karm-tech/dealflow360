import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { DB_MODES } from "./constants.js";

// DealFlow360 runs against two separate SQLite files:
//
//   dev.db   the live instance  — real work, starts with master data only
//   demo.db  the demo instance  — sample customers, quotes and history
//
// They are two different files opened by two different connections. Nothing is
// shared, so a change made while exploring the demo cannot reach live records.
//
// Demo and live are two separate SQLite files with two database connections.
// Which one you get is decided by your login token, not by a setting you can
// flip, so demo data can never leak into real records.

// Prisma resolves a relative sqlite path against the folder holding
// schema.prisma. When we override the url at runtime that starting point is no
// longer obvious, so both paths are made absolute here. The server then opens
// the file we mean no matter which folder npm was run from.
const PRISMA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../prisma");

function absoluteFileUrl(rawUrl, fallbackFile) {
  const url = rawUrl || `file:./${fallbackFile}`;
  if (!url.startsWith("file:")) {
    return url;
  }
  const filePath = url.slice("file:".length);
  if (path.isAbsolute(filePath)) {
    return url;
  }
  return `file:${path.join(PRISMA_DIR, filePath)}`;
}

export const DATABASE_FILES = {
  [DB_MODES.LIVE]: absoluteFileUrl(process.env.DATABASE_URL, "dev.db"),
  [DB_MODES.DEMO]: absoluteFileUrl(process.env.DEMO_DATABASE_URL, "demo.db"),
};

export const liveDb = new PrismaClient({
  datasources: { db: { url: DATABASE_FILES[DB_MODES.LIVE] } },
});

export const demoDb = new PrismaClient({
  datasources: { db: { url: DATABASE_FILES[DB_MODES.DEMO] } },
});

// Anything that is not exactly "demo" falls back to live. Guessing wrong in
// that direction is the safe mistake: an unclear session sees real data rules
// rather than being quietly handed the sample database.
export function dbForMode(mode) {
  return mode === DB_MODES.DEMO ? demoDb : liveDb;
}

export function normaliseMode(mode) {
  return mode === DB_MODES.DEMO ? DB_MODES.DEMO : DB_MODES.LIVE;
}

// Routes never import a client directly — they use req.db, which requireAuth
// sets from the login token. See server/src/routes/README.md.
export function dbFor(req) {
  return req.db || liveDb;
}

export async function disconnectAll() {
  await Promise.all([liveDb.$disconnect(), demoDb.$disconnect()]);
}
