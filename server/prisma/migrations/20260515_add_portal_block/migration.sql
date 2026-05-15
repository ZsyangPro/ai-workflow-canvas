-- CreateTable
CREATE TABLE "PortalBlock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalBlock_tenantId_idx" ON "PortalBlock"("tenantId");

-- CreateIndex
CREATE INDEX "PortalBlock_tenantId_sortOrder_idx" ON "PortalBlock"("tenantId", "sortOrder");

-- AddForeignKey
ALTER TABLE "PortalBlock" ADD CONSTRAINT "PortalBlock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
