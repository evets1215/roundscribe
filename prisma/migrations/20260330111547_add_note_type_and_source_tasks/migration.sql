-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "noteJson" JSONB NOT NULL,
    "audioKey" TEXT,
    "type" TEXT NOT NULL DEFAULT 'generated',
    "sourceTaskIds" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Note_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Note" ("audioKey", "createdAt", "id", "noteJson", "patientId", "transcript", "updatedAt") SELECT "audioKey", "createdAt", "id", "noteJson", "patientId", "transcript", "updatedAt" FROM "Note";
DROP TABLE "Note";
ALTER TABLE "new_Note" RENAME TO "Note";
CREATE INDEX "Note_patientId_idx" ON "Note"("patientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
