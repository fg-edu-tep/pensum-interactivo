-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "levelRestriction" TEXT,
ADD COLUMN     "offeringProjection" TEXT,
ADD COLUMN     "programRestriction" TEXT;

-- AlterTable
ALTER TABLE "CourseOffering" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'api';

-- AlterTable
ALTER TABLE "Elective" ADD COLUMN     "attrs" JSONB,
ADD COLUMN     "coreqText" TEXT,
ADD COLUMN     "programRestriction" TEXT,
ADD COLUMN     "projection" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "CodeName" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credits" DOUBLE PRECISION,
    "period" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeName_pkey" PRIMARY KEY ("code")
);
