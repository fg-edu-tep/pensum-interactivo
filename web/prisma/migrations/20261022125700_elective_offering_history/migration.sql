-- AlterTable
ALTER TABLE "Elective" ADD COLUMN     "codeSource" TEXT,
ADD COLUMN     "frequency" TEXT,
ADD COLUMN     "frequencySource" TEXT,
ADD COLUMN     "lastOfferedTerm" TEXT,
ADD COLUMN     "registroCredits" DOUBLE PRECISION,
ADD COLUMN     "registroName" TEXT,
ADD COLUMN     "registroPrereqText" TEXT;
