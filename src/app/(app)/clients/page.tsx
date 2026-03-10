import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { computeMaintenanceBadges } from "@/lib/maintenance";
import { ClientFeed, type ClientData, type VehicleData } from "./ClientFeed";
import { ClientsPageHeader } from "./ClientsPageHeader";
import { getTenantId } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export const metadata = {
  title: "Clients — DriveSync",
  description: "Client Rolodex with vehicle history and maintenance alerts.",
};

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

/**
 * Raw fetch — cached per tenant in the page so each tenant gets the correct list.
 */
async function fetchClientsForTenant(tenantId: string | undefined): Promise<ClientData[]> {
  if (!tenantId) return [];
  try {
    const rows = await prisma.client.findMany({
      where: { tenantId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        vehicles: {
          orderBy: { year: "desc" },
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            vin: true,
            plate: true,
            color: true,
            mileageIn: true,
            globalVehicle: {
              select: { maintenanceScheduleJson: true },
            },
          },
        },
      },
    });

    return rows.map((client: (typeof rows)[number]): ClientData => ({
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone,
      vehicles: client.vehicles.map((v: (typeof client.vehicles)[number]): VehicleData => {
        const schedule =
          v.globalVehicle && v.mileageIn != null
            ? (v.globalVehicle.maintenanceScheduleJson as Array<{
                service: string;
                intervalMiles?: number;
                atMileage?: number;
              }>)
            : [];
        const maintenanceBadges =
          v.mileageIn != null
            ? computeMaintenanceBadges(v.mileageIn, schedule)
            : [];
        return {
          id: v.id,
          make: v.make ?? "",
          model: v.model ?? "",
          year: v.year ?? 0,
          vin: v.vin,
          plate: v.plate,
          color: v.color,
          mileageIn: v.mileageIn,
          maintenanceBadges,
        };
      }),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Page component — per-tenant cache key so list is correct for logged-in tenant
// ---------------------------------------------------------------------------
export default async function ClientsPage() {
  const tenantId = await getTenantId();
  const clients = await unstable_cache(
    () => fetchClientsForTenant(tenantId ?? undefined),
    ["clients-list", tenantId ?? ""],
    { revalidate: 60, tags: ["clients"] },
  )();

  return (
    <div className="flex flex-col min-h-full">
      <ClientsPageHeader />
      {/* Interactive feed — client component handles search + expand */}
      <ClientFeed clients={clients} />

      {/* Bottom padding for mobile nav bar */}
      <div className="h-[env(safe-area-inset-bottom)] sm:hidden" />
    </div>
  );
}
