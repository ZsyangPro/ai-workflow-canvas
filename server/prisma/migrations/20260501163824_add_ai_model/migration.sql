-- CreateTable
CREATE TABLE "AiModel" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'sophnet',
    "baseUrl" TEXT NOT NULL DEFAULT 'https://www.sophnet.com/api/open-apis/projects/easyllms',
    "apiKey" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'image',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiModel_name_key" ON "AiModel"("name");
