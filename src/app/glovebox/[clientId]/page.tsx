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

export type GloveboxData = {
  client: { firstName: string; lastName: string; email: string | null };
  vehicles: GloveboxVehicle[];
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

    const vehicles: GloveboxVehicle[] = client.vehicles.map((v) => ({
      id: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      color: v.color,
      plate: v.plate,
      mileageIn: v.mileageIn,
      oilType: v.oilType,
      tireSize: v.tireSize,
      workOrders: v.workOrders.map((wo) => ({
        id: wo.id,
        title: wo.title,
        description: wo.description,
        totalCents: Math.round((wo.laborCents + wo.partsCents) * (1 + TAX_RATE)),
        closedAt: wo.closedAt?.toISOString() ?? null,
      })),
    }));

    return {
      client: {
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
      },
      vehicles,
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

  // Basic validation: CUIDs are alphanumeric and 25 chars
  if (!clientId || clientId.length > 64 || !/^[a-z0-9_-]+$/i.test(clientId)) {
    notFound();
  }

  const data = await fetchGloveboxData(clientId);
  if (!data) notFound();

  return <GloveboxClient data={data} />;
}
