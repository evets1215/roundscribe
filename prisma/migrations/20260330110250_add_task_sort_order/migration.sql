-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HandoffTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "dayNumber" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" DATETIME,
    "resolvedBy" TEXT,
    "resolvedNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HandoffTask_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HandoffTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HandoffTask" ("createdAt", "dayNumber", "id", "patientId", "resolvedAt", "resolvedBy", "resolvedNote", "source", "status", "text", "updatedAt", "userId") SELECT "createdAt", "dayNumber", "id", "patientId", "resolvedAt", "resolvedBy", "resolvedNote", "source", "status", "text", "updatedAt", "userId" FROM "HandoffTask";
DROP TABLE "HandoffTask";
ALTER TABLE "new_HandoffTask" RENAME TO "HandoffTask";
CREATE INDEX "HandoffTask_patientId_status_idx" ON "HandoffTask"("patientId", "status");
CREATE INDEX "HandoffTask_userId_idx" ON "HandoffTask"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
