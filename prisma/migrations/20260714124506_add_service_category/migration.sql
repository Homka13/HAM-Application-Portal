-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ServiceCatalog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'End-user Support',
    "description" TEXT
);
INSERT INTO "new_ServiceCatalog" ("description", "id", "name") SELECT "description", "id", "name" FROM "ServiceCatalog";
DROP TABLE "ServiceCatalog";
ALTER TABLE "new_ServiceCatalog" RENAME TO "ServiceCatalog";
CREATE UNIQUE INDEX "ServiceCatalog_name_key" ON "ServiceCatalog"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
