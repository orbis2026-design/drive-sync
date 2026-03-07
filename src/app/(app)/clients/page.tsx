import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { computeMaintenanceBadges, type MaintenanceItem } from "@/lib/maintenance";
import { ClientFeed, type ClientData, type VehicleData } from "./ClientFeed";

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
 * Fetch clients with a 60-second edge-cache TTL so the Vercel Edge Network
 * serves this static-ish list instantly on repeat requests, while still
 * refreshing in the background via stale-while-revalidate (Issue #39).
 */
const fetchClients = unstable_cache(
  async (tenantId: string | undefined): Promise<ClientData[]> => {
    try {
      const rows = await prisma.client.findMany({
        where: tenantId ? { tenantId } : undefined,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          vehicles: {
            orderBy: { year: "desc" },
            include: { globalVehicle: true },
          },
        },
      });

      return rows.map((client: (typeof rows)[number]): ClientData => ({
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone,
        vehicles: client.vehicles.map((v): VehicleData => {
          // Pre-compute maintenance badges server-side so the initial render is
          // fully populated — no extra client round-trip on first expand.
          const schedule =
            v.globalVehicle && v.mileageIn != null
              ? (v.globalVehicle.maintenanceScheduleJson as MaintenanceItem[])
              : [];

          const maintenanceBadges =
            v.mileageIn != null
              ? computeMaintenanceBadges(v.mileageIn, schedule)
              : [];

          return {
            id: v.id,
            make: v.make,
            model: v.model,
            year: v.year,
            vin: v.vin,
            plate: v.plate,
            color: v.color,
            mileageIn: v.mileageIn,
            maintenanceBadges,
          };
        }),
      }));
    } catch {
      // Database not yet available (e.g. during initial setup without
      // a provisioned DATABASE_URL). Return an empty list so the page
      // still renders cleanly.
      return [];
    }
  },
  ["clients-list"],
  { revalidate: 60, tags: ["clients"] },
);

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default async function ClientsPage() {
  const tenantId = process.env.DEMO_TENANT_ID;
  const clients = await fetchClients(tenantId);

  return (
    <div className="flex flex-col min-h-full">
      {/* Page header */}
      <header className="px-4 pt-6 pb-2">
        <h1 className="text-4xl font-black text-white tracking-tight">
          Clients
        </h1>
        <p className="text-base text-gray-400 mt-1">
          Tap a card to see vehicles &amp; maintenance alerts.
        </p>
      </header>

      {/* Interactive feed — client component handles search + expand */}
      <ClientFeed clients={clients} />

      {/* Bottom padding for mobile nav bar */}
      <div className="h-[env(safe-area-inset-bottom)] sm:hidden" />
    </div>
  );
}
