-- DropForeignKey
ALTER TABLE "GeneratedAsset" DROP CONSTRAINT "GeneratedAsset_canvasId_fkey";

-- AlterTable
ALTER TABLE "GeneratedAsset" ALTER COLUMN "canvasId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "GeneratedAsset" ADD CONSTRAINT "GeneratedAsset_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "Canvas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
