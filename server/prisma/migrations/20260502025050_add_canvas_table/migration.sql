-- CreateTable
CREATE TABLE "Canvas" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "edges" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Canvas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Canvas_userId_key" ON "Canvas"("userId");
