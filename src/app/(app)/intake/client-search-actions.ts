"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClientSearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  isCommercialFleet: boolean;
  vehicles: {
    id: string;
    make: string | null;
    model: string | null;
    year: number | null;
    plate: string | null;
    vin: string | null;
  }[];
};

// ---------------------------------------------------------------------------
// searchClients — full-text search by name, phone, plate, or VIN
// ---------------------------------------------------------------------------

export async function searchClients(
  query: string,
): Promise<ClientSearchResult[]> {
  const { tenantId } = await verifySession();
  const q = query.trim();
  if (q.length < 2) return [];

  try {
    const clients = await prisma.client.findMany({
      where: {
        tenantId,
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { vehicles: { some: { plate: { contains: q, mode: "insensitive" } } } },
          { vehicles: { some: { vin: { contains: q, mode: "insensitive" } } } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        isCommercialFleet: true,
        vehicles: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            plate: true,
            vin: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      take: 8,
    });

    return clients;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// createClient — create a new client record for the active tenant
// ---------------------------------------------------------------------------

export type NewClientInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  isCommercialFleet?: boolean;
};

export async function createClient(
  input: NewClientInput,
): Promise<{ id: string } | { error: string }> {
  const { tenantId } = await verifySession();

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const phone = input.phone.trim();

  if (!firstName) return { error: "First name is required." };
  if (!lastName) return { error: "Last name is required." };
  if (!phone) return { error: "Phone number is required." };

  try {
    const client = await prisma.client.create({
      data: {
        tenantId,
        firstName,
        lastName,
        phone,
        email: input.email?.trim() || null,
        isCommercialFleet: input.isCommercialFleet ?? false,
      },
      select: { id: true },
    });
    revalidateTag("clients", "max");
    revalidatePath("/clients");
    return { id: client.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create client.";
    return { error: message };
  }
}
