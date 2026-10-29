-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "lastOfferedTerm" TEXT,
ADD COLUMN     "minCredits" INTEGER,
ADD COLUMN     "minCreditsSemesters" INTEGER,
ADD COLUMN     "nextOfferingTerm" TEXT,
ADD COLUMN     "restrictionText" TEXT;

-- AlterTable
ALTER TABLE "Elective" ADD COLUMN     "minCredits" INTEGER,
ADD COLUMN     "nextOfferingTerm" TEXT;
