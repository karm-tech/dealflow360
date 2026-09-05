-- Signup becomes an access request.
--   role   is now optional  — a request has no role until an admin picks one
--   status replaces isActive — PENDING | ACTIVE | REJECTED | DISABLED
--
-- Accounts that already existed were active, so they are carried over as
-- ACTIVE rather than being dropped into the pending queue.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedRole" TEXT,
    "approvedById" INTEGER,
    "approvedAt" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" INTEGER,
    CONSTRAINT "User_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "customerId", "email", "id", "name", "passwordHash", "role", "status") SELECT "createdAt", "customerId", "email", "id", "name", "passwordHash", "role", 'ACTIVE' FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
