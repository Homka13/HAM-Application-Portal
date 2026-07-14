-- CreateTable
CREATE TABLE "ServiceCatalog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicantName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SERVICE_REQUEST',
    "priority" TEXT NOT NULL DEFAULT 'LOW',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "description" TEXT,
    "assignee" TEXT,
    "slaDeadline" DATETIME,
    "serviceCatalogId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Application_serviceCatalogId_fkey" FOREIGN KEY ("serviceCatalogId") REFERENCES "ServiceCatalog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Application" ("applicantName", "assignee", "createdAt", "description", "id", "priority", "slaDeadline", "status", "type") SELECT "applicantName", "assignee", "createdAt", "description", "id", "priority", "slaDeadline", "status", "type" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCatalog_name_key" ON "ServiceCatalog"("name");
