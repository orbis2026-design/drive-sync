-- Migration: Marketing, Analytics, Glovebox & PWA features
-- Adds OutboundCampaign table, vehicle spec fields, and WorkOrder COGS tracking.

-- OutboundCampaignStatus enum
CREATE TYPE "OutboundCampaignStatus" AS ENUM ('QUEUED', 'SENT', 'DISCARDED');

-- OutboundCampaign table
CREATE TABLE "OutboundCampaign" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "clientId"     TEXT,
    "phoneNumber"  TEXT,
    "message"      TEXT NOT NULL,
    "campaignType" TEXT NOT NULL,
    "audience"     TEXT,
    "status"       "OutboundCampaignStatus" NOT NULL DEFAULT 'QUEUED',
    "sentAt"       TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundCampaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboundCampaign_tenantId_idx" ON "OutboundCampaign"("tenantId");
CREATE INDEX "OutboundCampaign_tenantId_status_idx" ON "OutboundCampaign"("tenantId", "status");

ALTER TABLE "OutboundCampaign"
    ADD CONSTRAINT "OutboundCampaign_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboundCampaign"
    ADD CONSTRAINT "OutboundCampaign_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vehicle: oil type and tire size for Digital Glovebox
ALTER TABLE "Vehicle" ADD COLUMN "oilType"  TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "tireSize" TEXT;

-- WorkOrder: wholesale parts cost for accurate COGS calculation
ALTER TABLE "WorkOrder" ADD COLUMN "partsCostCents" INTEGER;
