import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
      return NextResponse.json({ found: false });
    }

    return NextResponse.json({
      found: true,
      make: vehicle.make,
      model: vehicle.model,
      year,
      oilCapacityQts: vehicle.oilCapacityQts,
      oilWeightOem: vehicle.oilWeightOem,
      oilFilterPartNote: "See OEM filter lookup",
    });
  } catch (err) {
    console.error("[public-lookup] DB error:", err);
    return NextResponse.json({ found: false });
  }
}
