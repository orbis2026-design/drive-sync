import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { computeMaintenanceBadges } from "@/lib/maintenance";
import { ClientFeed, type ClientData, type VehicleData } from "./ClientFeed";
import { ClientsPageHeader } from "./ClientsPageHeader";
import { getTenantId, getSessionUserId, getUserRole } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export const metadata = {
  title: "Clients — Boltbook",
  description: "Clients and vehicles; open a client to start or view a work order.",
};

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

async function mapClients(
  clients: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string;
  }[],
): Promise<ClientData[]> {
  if (clients.length === 0) return [];

  const clientIds = clients.map((c) => c.id);

  const vehicles = await prisma.vehicle.findMany({
    where: { clientId: { in: clientIds } },
    orderBy: { year: "desc" },
    select: {
      id: true,
      clientId: true,
      make: true,
      model: true,
      year: true,
      vin: true,
      plate: true,
      color: true,
      mileageIn: true,
      globalVehicleId: true,
    },
  });

  const globalVehicleIds = vehicles
    .map((v) => v.globalVehicleId)
    .filter((id): id is string => !!id);

  const globalVehicles =
    globalVehicleIds.length > 0
      ? await prisma.globalVehicle.findMany({
          where: { id: { in: globalVehicleIds } },
          select: { id: true, maintenanceScheduleJson: true },
        })
      : [];

  const scheduleByGlobalId = new Map(
    globalVehicles.map((gv) => [gv.id, gv.maintenanceScheduleJson]),
  );

  const vehiclesByClient = new Map<string, typeof vehicles>();
  for (const v of vehicles) {
    const list = vehiclesByClient.get(v.clientId) ?? [];
    list.push(v);
    vehiclesByClient.set(v.clientId, list);
  }

  return clients.map((client): ClientData => {
    const clientVehicles = vehiclesByClient.get(client.id) ?? [];
    return {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone,
      vehicles: clientVehicles.map((v): VehicleData => {
        const rawSchedule =
          v.globalVehicleId && v.mileageIn != null
            ? (scheduleByGlobalId.get(v.globalVehicleId) as
                | Array<{
                    service: string;
                    intervalMiles?: number;
                    atMileage?: number;
                  }>
                | undefined)
            : undefined;
        const schedule = rawSchedule ?? [];
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
    };
  });
}

/**
 * Raw fetch — cached per tenant in the page so each tenant gets the correct list.
 */
async function fetchClientsForTenant(tenantId: string | undefined): Promise<ClientData[]> {
  if (!tenantId) return [];
  try {
    const rows = await prisma.client.findMany({
      where: { tenantId, isArchived: false },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });

    return mapClients(rows);
  } catch {
    return [];
  }
}

/**
 * Fallback for SHOP_OWNER when tenant wiring is not complete: show all clients.
 * This is primarily for development / debug and prevents empty screens when
 * data exists but tenant mapping is inconsistent.
 */
async function fetchAllClients(): Promise<ClientData[]> {
  try {
    const rows = await prisma.client.findMany({
      where: { isArchived: false },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });
    return mapClients(rows);
  } catch {
    return [];
  }
}

const getCachedClients = unstable_cache(
  async (tenantId: string | null): Promise<ClientData[]> =>
    fetchClientsForTenant(tenantId ?? undefined),
  ["clients-list"],
  { revalidate: 60, tags: ["clients"] },
);

// ---------------------------------------------------------------------------
// Page component — per-tenant cache key so list is correct for logged-in tenant
// ---------------------------------------------------------------------------
export default async function ClientsPage() {
  const userId = await getSessionUserId();
  const roleRow = userId ? await getUserRole(userId) : null;
  const tenantId = await getTenantId();

  // TEMP: during development, always show all clients for SHOP_OWNER so we
  // don't get blocked by tenant wiring issues. Other roles remain tenant-scoped.
  const clients =
    roleRow?.role === "SHOP_OWNER"
      ? await fetchAllClients()
      : await getCachedClients(tenantId);

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
