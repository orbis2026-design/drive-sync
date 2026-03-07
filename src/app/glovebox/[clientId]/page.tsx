import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TAX_RATE } from "@/app/(app)/quotes/[workOrderId]/constants";
import { GloveboxClient } from "./GloveboxClient";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export const metadata = {
  title: "My Vehicle Hub — DriveSync",
  description: "View your vehicles, service history, and receipts.",
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

export type GloveboxVehicle = {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  plate: string | null;
  mileageIn: number | null;
  oilType: string | null;
  tireSize: string | null;
  workOrders: GloveboxWorkOrder[];
};

export type GloveboxWorkOrder = {
  id: string;
  title: string;
  description: string;
  totalCents: number;
  closedAt: string | null;
};

export type GloveboxWarranty = {
  id: string;
  partName: string;
  partNumber: string | null;
  supplier: string | null;
  installedAt: string;
  warrantyMonths: number;
  expiresAt: string;
};

export type GloveboxData = {
  client: { firstName: string; lastName: string; email: string | null };
  vehicles: GloveboxVehicle[];
  warranties: GloveboxWarranty[];
};

// ---------------------------------------------------------------------------
// Internal types that match the Prisma select shapes used below.
// These avoid `any` casts while keeping the code compile-safe even when the
// Prisma client has not been generated yet (e.g. in CI without a live DB).
// ---------------------------------------------------------------------------

type PrismaWorkOrderRow = {
  id: string;
  title: string;
  description: string;
  laborCents: number;
  partsCents: number;
  closedAt: Date | null;
};

type PrismaVehicleRow = {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  plate: string | null;
  mileageIn: number | null;
  oilType: string | null;
  tireSize: string | null;
  workOrders: PrismaWorkOrderRow[];
};

type PrismaWarrantyRow = {
  id: string;
  partName: string;
  partNumber: string | null;
  supplier: string | null;
  installedAt: Date;
  warrantyMonths: number;
  expiresAt: Date;
};

async function fetchGloveboxData(
  clientId: string,
): Promise<GloveboxData | null> {
  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        tenantId: true,
        vehicles: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            color: true,
            plate: true,
            mileageIn: true,
            oilType: true,
            tireSize: true,
            workOrders: {
              where: { status: "PAID" },
              orderBy: { closedAt: "desc" },
              select: {
                id: true,
                title: true,
                description: true,
                laborCents: true,
                partsCents: true,
                closedAt: true,
              },
            },
          },
        },
      },
    });

    if (!client) return null;

    const vehicles: GloveboxVehicle[] = (client.vehicles as PrismaVehicleRow[]).map((v) => ({
      id: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      color: v.color,
      plate: v.plate,
      mileageIn: v.mileageIn,
      oilType: v.oilType,
      tireSize: v.tireSize,
      workOrders: (v.workOrders as PrismaWorkOrderRow[]).map((wo) => ({
        id: wo.id,
        title: wo.title,
        description: wo.description,
        totalCents: Math.round((wo.laborCents + wo.partsCents) * (1 + TAX_RATE)),
        closedAt: wo.closedAt?.toISOString() ?? null,
      })),
    }));

    // Fetch active warranties for this client.
    let warranties: GloveboxWarranty[] = [];
    try {
      const rawWarranties = await prisma.warranty.findMany({
        where: { tenantId: client.tenantId, clientId },
        orderBy: { expiresAt: "asc" },
        select: {
          id: true,
          partName: true,
          partNumber: true,
          supplier: true,
          installedAt: true,
          warrantyMonths: true,
          expiresAt: true,
        },
      });
      warranties = (rawWarranties as PrismaWarrantyRow[]).map((w) => ({
        id: w.id,
        partName: w.partName,
        partNumber: w.partNumber,
        supplier: w.supplier,
        installedAt: w.installedAt.toISOString(),
        warrantyMonths: w.warrantyMonths,
        expiresAt: w.expiresAt.toISOString(),
      }));
    } catch {
      // Non-fatal — warranties table may not exist in older environments.
    }

    return {
      client: {
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
      },
      vehicles,
      warranties,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function GloveboxPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  // Validate the clientId: allow CUIDs (alphanumeric + hyphens, up to 64 chars).
  if (!clientId || clientId.length > 64 || !/^[a-z0-9_-]+$/i.test(clientId)) {
    notFound();
  }

  const data = await fetchGloveboxData(clientId);
  if (!data) notFound();

  return <GloveboxClient data={data} />;
}
