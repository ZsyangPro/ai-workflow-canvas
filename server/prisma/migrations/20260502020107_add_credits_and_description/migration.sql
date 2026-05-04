-- AlterTable
ALTER TABLE "AiModel" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 0;
