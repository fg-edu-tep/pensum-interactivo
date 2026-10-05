-- CreateTable
CREATE TABLE "AdminUser" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "mustReset" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroImport" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'parsed',
    "fileBytes" BYTEA,
    "scope" JSONB NOT NULL,
    "termWindow" JSONB,
    "parseStats" JSONB,
    "reduceStats" JSONB,
    "resolutions" JSONB,
    "applyResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "RegistroImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroCourse" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "normalizedCode" TEXT NOT NULL,
    "displayCode" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,
    "credits" DOUBLE PRECISION,
    "departamento" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "prereqText" TEXT,
    "coreqText" TEXT,
    "restrictions" JSONB,
    "isCore" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RegistroCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapEdit" (
    "id" SERIAL NOT NULL,
    "catalogId" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "ops" JSONB NOT NULL,
    "undo" JSONB NOT NULL,
    "snapshotId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "MapEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE INDEX "AdminUser_disabled_idx" ON "AdminUser"("disabled");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "RegistroImport_status_idx" ON "RegistroImport"("status");

-- CreateIndex
CREATE INDEX "RegistroCourse_normalizedCode_idx" ON "RegistroCourse"("normalizedCode");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroCourse_importId_normalizedCode_key" ON "RegistroCourse"("importId", "normalizedCode");

-- CreateIndex
CREATE INDEX "MapEdit_catalogId_idx" ON "MapEdit"("catalogId");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroCourse" ADD CONSTRAINT "RegistroCourse_importId_fkey" FOREIGN KEY ("importId") REFERENCES "RegistroImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapEdit" ADD CONSTRAINT "MapEdit_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

