-- CreateTable
CREATE TABLE "VideoTask" (
    "id" SERIAL NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "modelId" INTEGER NOT NULL,
    "canvasId" INTEGER NOT NULL,
    "nodeId" TEXT,
    "prompt" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'running',
    "videoUrl" TEXT,
    "lastFrameUrl" TEXT,
    "costCredits" INTEGER NOT NULL,
    "refunded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoTask_taskId_key" ON "VideoTask"("taskId");

-- CreateIndex
CREATE INDEX "VideoTask_userId_idx" ON "VideoTask"("userId");

-- CreateIndex
CREATE INDEX "VideoTask_status_idx" ON "VideoTask"("status");
