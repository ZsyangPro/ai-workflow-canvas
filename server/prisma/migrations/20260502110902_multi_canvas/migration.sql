-- DropIndex
DROP INDEX "Canvas_userId_key";

-- AlterTable
ALTER TABLE "Canvas" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Canvas_userId_idx" ON "Canvas"("userId");
