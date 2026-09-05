import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { DB_MODES } from "./constants.js";

// Two separate SQLite files opened by two connections:
//   dev.db   live instance, master data only
//   demo.db  demo instance, sample customers, quotes and history
// Nothing is shared between them.

// Prisma resolves relative sqlite paths against the schema folder. Overriding
// the url at runtime loses that base, so both are made absolute here.
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

// Anything other than "demo" resolves to live: an unclear session should hit
// live rules rather than be handed the sample database.
export function dbForMode(mode) {
  return mode === DB_MODES.DEMO ? demoDb : liveDb;
}

export function normaliseMode(mode) {
  return mode === DB_MODES.DEMO ? DB_MODES.DEMO : DB_MODES.LIVE;
}

export async function disconnectAll() {
  await Promise.all([liveDb.$disconnect(), demoDb.$disconnect()]);
}
