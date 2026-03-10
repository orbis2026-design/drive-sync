import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

type VehicleLookupResult =
  | { found: true; make: string; model: string; year: number; oilCapacityQts: number | null; oilWeightOem: string | null; oilFilterPartNote: string }
  | { found: false };

const lookupGlobalVehicle = unstable_cache(
  async (make: string, model: string, year: number): Promise<VehicleLookupResult> => {
    try {
      const vehicle = await prisma.globalVehicle.findFirst({
        where: {
          make: { equals: make, mode: "insensitive" },
          model: { equals: model, mode: "insensitive" },
          yearStart: { lte: year },
          OR: [{ yearEnd: null }, { yearEnd: { gte: year } }],
        },
        select: {
          make: true,
          model: true,
          yearStart: true,
          oilCapacityQts: true,
          oilWeightOem: true,
        },
      });

      if (!vehicle) {
        return { found: false };
      }

      return {
        found: true,
        make: vehicle.make,
        model: vehicle.model,
        year,
        oilCapacityQts: vehicle.oilCapacityQts,
        oilWeightOem: vehicle.oilWeightOem,
        oilFilterPartNote: "See OEM filter lookup",
      };
    } catch (err) {
      logger.error("Vehicle lookup failed", { service: "lexicon" }, err);
      return { found: false };
    }
  },
  ["global-vehicle-lookup"],
  { revalidate: 86400, tags: ["vehicles"] },
);

/**
 * GET /api/lexicon/public-lookup
 *
 * Public endpoint (no auth required) for looking up vehicle fluid specs.
 * Query params: make, model, year
 *
 * Returns 200 always:
 *   { found: true,  make, model, year, oilCapacityQts, oilWeightOem, oilFilterPartNote }
 *   { found: false }
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const make = searchParams.get("make")?.trim();
  const model = searchParams.get("model")?.trim();
  const yearRaw = searchParams.get("year");

  if (!make || !model || !yearRaw) {
    return NextResponse.json({ found: false });
  }

  const year = parseInt(yearRaw, 10);
  if (isNaN(year)) {
    return NextResponse.json({ found: false });
  }

  const result = await lookupGlobalVehicle(make, model, year);
  return NextResponse.json(result);
}
