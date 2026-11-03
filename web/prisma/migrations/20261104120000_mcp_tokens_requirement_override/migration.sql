-- Admin override of a course's requirements (document beats the live API), and
-- personal access tokens for the MCP endpoint (/api/mcp).

-- AlterTable
ALTER TABLE "CatalogCourse" ADD COLUMN     "coreqOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prereqOverride" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AdminApiToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AdminApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminApiToken_tokenHash_key" ON "AdminApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminApiToken_userId_idx" ON "AdminApiToken"("userId");

-- AddForeignKey
ALTER TABLE "AdminApiToken" ADD CONSTRAINT "AdminApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
