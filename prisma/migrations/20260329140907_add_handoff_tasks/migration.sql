-- CreateTable
CREATE TABLE "HandoffTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "dayNumber" INTEGER NOT NULL DEFAULT 1,
    "resolvedAt" DATETIME,
    "resolvedBy" TEXT,
    "resolvedNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HandoffTask_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HandoffTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Patient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "dob" TEXT NOT NULL,
    "sex" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "handoffNote" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Patient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Patient" ("createdAt", "dob", "id", "mrn", "name", "pinned", "room", "sex", "status", "updatedAt", "userId") SELECT "createdAt", "dob", "id", "mrn", "name", "pinned", "room", "sex", "status", "updatedAt", "userId" FROM "Patient";
DROP TABLE "Patient";
ALTER TABLE "new_Patient" RENAME TO "Patient";
CREATE INDEX "Patient_userId_idx" ON "Patient"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "HandoffTask_patientId_status_idx" ON "HandoffTask"("patientId", "status");

-- CreateIndex
CREATE INDEX "HandoffTask_userId_idx" ON "HandoffTask"("userId");
