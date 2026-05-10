-- AlterTable
ALTER TABLE "GeneratedAsset" ADD COLUMN     "userId" INTEGER;

-- CreateIndex
CREATE INDEX "GeneratedAsset_userId_idx" ON "GeneratedAsset"("userId");

-- AddForeignKey
ALTER TABLE "GeneratedAsset" ADD CONSTRAINT "GeneratedAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
