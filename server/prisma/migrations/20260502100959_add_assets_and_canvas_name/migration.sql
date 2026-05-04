-- AlterTable
ALTER TABLE "Canvas" ADD COLUMN     "name" TEXT NOT NULL DEFAULT '未命名画布';

-- CreateTable
CREATE TABLE "GeneratedAsset" (
    "id" SERIAL NOT NULL,
    "canvasId" INTEGER NOT NULL,
    "nodeId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "prompt" TEXT,
    "modelName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedAsset_canvasId_idx" ON "GeneratedAsset"("canvasId");

-- CreateIndex
CREATE INDEX "GeneratedAsset_nodeId_idx" ON "GeneratedAsset"("nodeId");

-- AddForeignKey
ALTER TABLE "GeneratedAsset" ADD CONSTRAINT "GeneratedAsset_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "Canvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
