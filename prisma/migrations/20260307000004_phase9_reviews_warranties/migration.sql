-- AlterTable: add Google Business and owner phone fields to Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "googlePlaceId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "reviewLink" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "ownerPhone" TEXT;

-- CreateTable: Warranty
CREATE TABLE "Warranty" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "clientId" TEXT,
    "partName" TEXT NOT NULL,
    "partNumber" TEXT,
    "supplier" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warrantyMonths" INTEGER NOT NULL DEFAULT 12,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warranty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Warranty_tenantId_idx" ON "Warranty"("tenantId");
CREATE INDEX "Warranty_workOrderId_idx" ON "Warranty"("workOrderId");

-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
