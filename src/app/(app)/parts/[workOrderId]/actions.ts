"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Part {
  id: string;
  name: string;
  partNumber: string;
  supplier: "AutoZone" | "Worldpac";
  /** What the shop pays, in US cents. */
  wholesalePriceCents: number;
  /** Retail price using a 40% gross-margin algorithm: retail = wholesale / 0.60 */
  retailPriceCents: number;
  /** Human-readable ETA string, e.g. "Delivery: 45 mins". */
  etaLabel: string;
}

/** A finalised line item persisted to the work order. */
export interface SelectedPart {
  partId: string;
  name: string;
  partNumber: string;
  supplier: "AutoZone" | "Worldpac";
  wholesalePriceCents: number;
  retailPriceCents: number;
  quantity: number;
}

/** Shared return type for write Server Actions. */
export interface ActionResult {
  error?: string;
}

// ---------------------------------------------------------------------------
// 40% gross-margin helper
// ---------------------------------------------------------------------------

/** Retail = Wholesale / (1 – 0.40) = Wholesale / 0.60, rounded up to the cent. */
function toRetailCents(wholesaleCents: number): number {
  return Math.ceil(wholesaleCents / 0.6);
}

// ---------------------------------------------------------------------------
// Parts simulation catalog
// ---------------------------------------------------------------------------
// In production this would call a real supplier API (AutoZone Pro, Worldpac
// online catalogue, or a middleware like PartsTech / Nexpart).
// ---------------------------------------------------------------------------

interface SupplierEntry {
  partNumber: string;
  wholesalePriceCents: number;
  /** Time until delivery/pickup, in minutes. */
  etaMinutes: number;
}

interface PartTemplate {
  baseName: string;
  keywords: string[];
  autoZone: SupplierEntry[];
  worldpac: SupplierEntry[];
}

const PART_CATALOG: PartTemplate[] = [
  {
    baseName: "Oil Filter",
    keywords: ["oil filter", "oil", "filter"],
    autoZone: [
      { partNumber: "AZ-OF-34631", wholesalePriceCents: 920, etaMinutes: 35 },
      { partNumber: "AZ-OF-51516", wholesalePriceCents: 1180, etaMinutes: 45 },
    ],
    worldpac: [
      { partNumber: "WP-OF-M651", wholesalePriceCents: 740, etaMinutes: 150 },
      { partNumber: "WP-OF-E116", wholesalePriceCents: 860, etaMinutes: 180 },
    ],
  },
  {
    baseName: "Brake Pads — Front",
    keywords: ["brake pads", "brake pad", "front pads", "pads"],
    autoZone: [
      { partNumber: "AZ-BP-D1060", wholesalePriceCents: 4250, etaMinutes: 40 },
      { partNumber: "AZ-BP-D1424", wholesalePriceCents: 5890, etaMinutes: 55 },
    ],
    worldpac: [
      { partNumber: "WP-BP-FDB1649", wholesalePriceCents: 3610, etaMinutes: 120 },
      { partNumber: "WP-BP-FDB2217", wholesalePriceCents: 4990, etaMinutes: 150 },
    ],
  },
  {
    baseName: "Brake Rotor — Front",
    keywords: ["brake rotor", "rotor", "disc", "front rotor"],
    autoZone: [
      { partNumber: "AZ-BR-18049", wholesalePriceCents: 5800, etaMinutes: 50 },
      { partNumber: "AZ-BR-55197", wholesalePriceCents: 8400, etaMinutes: 60 },
    ],
    worldpac: [
      { partNumber: "WP-BR-BD126113", wholesalePriceCents: 4650, etaMinutes: 120 },
      { partNumber: "WP-BR-BD126142", wholesalePriceCents: 7100, etaMinutes: 150 },
    ],
  },
  {
    baseName: "Spark Plugs (Set of 4)",
    keywords: ["spark plug", "spark plugs", "plugs", "ignition"],
    autoZone: [
      { partNumber: "AZ-SP-3477", wholesalePriceCents: 2880, etaMinutes: 30 },
      { partNumber: "AZ-SP-4509", wholesalePriceCents: 4620, etaMinutes: 40 },
    ],
    worldpac: [
      { partNumber: "WP-SP-ZFR5F11", wholesalePriceCents: 2210, etaMinutes: 100 },
      { partNumber: "WP-SP-IK20TT", wholesalePriceCents: 3850, etaMinutes: 120 },
    ],
  },
  {
    baseName: "Air Filter",
    keywords: ["air filter", "air", "intake filter", "engine air"],
    autoZone: [
      { partNumber: "AZ-AF-CA9693", wholesalePriceCents: 1140, etaMinutes: 30 },
      { partNumber: "AZ-AF-CA10013", wholesalePriceCents: 1560, etaMinutes: 35 },
    ],
    worldpac: [
      { partNumber: "WP-AF-E3702", wholesalePriceCents: 820, etaMinutes: 90 },
      { partNumber: "WP-AF-C35667", wholesalePriceCents: 1080, etaMinutes: 110 },
    ],
  },
  {
    baseName: "Cabin Air Filter",
    keywords: ["cabin filter", "cabin air", "pollen filter", "hvac filter"],
    autoZone: [
      { partNumber: "AZ-CF-CF10285", wholesalePriceCents: 1680, etaMinutes: 30 },
      { partNumber: "AZ-CF-CF10134", wholesalePriceCents: 2240, etaMinutes: 35 },
    ],
    worldpac: [
      { partNumber: "WP-CF-LAK167", wholesalePriceCents: 1340, etaMinutes: 90 },
      { partNumber: "WP-CF-LA487S", wholesalePriceCents: 1890, etaMinutes: 100 },
    ],
  },
  {
    baseName: "Oxygen Sensor — Upstream",
    keywords: ["oxygen sensor", "o2 sensor", "o2", "upstream sensor", "lambda"],
    autoZone: [
      { partNumber: "AZ-O2-234-4209", wholesalePriceCents: 5990, etaMinutes: 55 },
      { partNumber: "AZ-O2-234-4668", wholesalePriceCents: 8340, etaMinutes: 65 },
    ],
    worldpac: [
      { partNumber: "WP-O2-250301", wholesalePriceCents: 4820, etaMinutes: 150 },
      { partNumber: "WP-O2-258005", wholesalePriceCents: 7200, etaMinutes: 180 },
    ],
  },
  {
    baseName: "MAF Sensor",
    keywords: ["maf", "mass air flow", "mass airflow", "airflow sensor"],
    autoZone: [
      { partNumber: "AZ-MAF-245-1070", wholesalePriceCents: 8750, etaMinutes: 60 },
      { partNumber: "AZ-MAF-245-1244", wholesalePriceCents: 11200, etaMinutes: 70 },
    ],
    worldpac: [
      { partNumber: "WP-MAF-22680", wholesalePriceCents: 7100, etaMinutes: 150 },
      { partNumber: "WP-MAF-22204", wholesalePriceCents: 9480, etaMinutes: 180 },
    ],
  },
  {
    baseName: "Thermostat",
    keywords: ["thermostat", "coolant thermostat", "temp thermostat"],
    autoZone: [
      { partNumber: "AZ-TH-33285", wholesalePriceCents: 2150, etaMinutes: 35 },
      { partNumber: "AZ-TH-33592", wholesalePriceCents: 3480, etaMinutes: 45 },
    ],
    worldpac: [
      { partNumber: "WP-TH-TX15", wholesalePriceCents: 1640, etaMinutes: 100 },
      { partNumber: "WP-TH-TX16", wholesalePriceCents: 2890, etaMinutes: 120 },
    ],
  },
  {
    baseName: "Water Pump",
    keywords: ["water pump", "coolant pump", "pump"],
    autoZone: [
      { partNumber: "AZ-WP-43505", wholesalePriceCents: 7640, etaMinutes: 55 },
      { partNumber: "AZ-WP-43542", wholesalePriceCents: 12800, etaMinutes: 75 },
    ],
    worldpac: [
      { partNumber: "WP-WP-GMB126", wholesalePriceCents: 5980, etaMinutes: 180 },
      { partNumber: "WP-WP-GMB142", wholesalePriceCents: 10400, etaMinutes: 210 },
    ],
  },
  {
    baseName: "Alternator",
    keywords: ["alternator", "generator", "charging", "charge"],
    autoZone: [
      { partNumber: "AZ-AL-13877", wholesalePriceCents: 18900, etaMinutes: 75 },
      { partNumber: "AZ-AL-13902", wholesalePriceCents: 24500, etaMinutes: 90 },
    ],
    worldpac: [
      { partNumber: "WP-AL-400-52011", wholesalePriceCents: 15400, etaMinutes: 210 },
      { partNumber: "WP-AL-400-52233", wholesalePriceCents: 20800, etaMinutes: 240 },
    ],
  },
  {
    baseName: "Starter Motor",
    keywords: ["starter", "starter motor", "start motor"],
    autoZone: [
      { partNumber: "AZ-SM-17877", wholesalePriceCents: 16200, etaMinutes: 70 },
      { partNumber: "AZ-SM-17919", wholesalePriceCents: 21400, etaMinutes: 85 },
    ],
    worldpac: [
      { partNumber: "WP-SM-280-7002", wholesalePriceCents: 13100, etaMinutes: 200 },
      { partNumber: "WP-SM-280-7003", wholesalePriceCents: 18700, etaMinutes: 230 },
    ],
  },
  {
    baseName: "Battery — 12V",
    keywords: ["battery", "12v battery", "car battery", "lead acid"],
    autoZone: [
      { partNumber: "AZ-BAT-35-1", wholesalePriceCents: 9800, etaMinutes: 20 },
      { partNumber: "AZ-BAT-65-3", wholesalePriceCents: 13400, etaMinutes: 20 },
    ],
    worldpac: [
      { partNumber: "WP-BAT-H6-AGM", wholesalePriceCents: 8200, etaMinutes: 120 },
      { partNumber: "WP-BAT-H7-AGM", wholesalePriceCents: 11600, etaMinutes: 120 },
    ],
  },
  {
    baseName: "Tie Rod End — Outer",
    keywords: ["tie rod", "tie rod end", "steering", "outer tie rod"],
    autoZone: [
      { partNumber: "AZ-TR-ES3480", wholesalePriceCents: 3220, etaMinutes: 50 },
      { partNumber: "AZ-TR-ES3688", wholesalePriceCents: 4810, etaMinutes: 60 },
    ],
    worldpac: [
      { partNumber: "WP-TR-JTES3480T", wholesalePriceCents: 2680, etaMinutes: 140 },
      { partNumber: "WP-TR-JTES3688T", wholesalePriceCents: 3940, etaMinutes: 160 },
    ],
  },
  {
    baseName: "Fuel Pump Assembly",
    keywords: ["fuel pump", "fuel", "pump", "sending unit"],
    autoZone: [
      { partNumber: "AZ-FP-E3920M", wholesalePriceCents: 18400, etaMinutes: 80 },
      { partNumber: "AZ-FP-E8229M", wholesalePriceCents: 24700, etaMinutes: 90 },
    ],
    worldpac: [
      { partNumber: "WP-FP-HP10266", wholesalePriceCents: 15200, etaMinutes: 210 },
      { partNumber: "WP-FP-HP10432", wholesalePriceCents: 20500, etaMinutes: 240 },
    ],
  },
];

/** Generic fallback when no catalog match is found. */
const GENERIC_TEMPLATE: PartTemplate = {
  baseName: "Auto Part",
  keywords: [],
  autoZone: [
    { partNumber: "AZ-GEN-001", wholesalePriceCents: 5000, etaMinutes: 45 },
  ],
  worldpac: [
    { partNumber: "WP-GEN-001", wholesalePriceCents: 3900, etaMinutes: 150 },
  ],
};

// ---------------------------------------------------------------------------
// ETA label helpers
// ---------------------------------------------------------------------------

function autoZoneEtaLabel(minutes: number): string {
  return `Delivery: ${minutes} min${minutes === 1 ? "" : "s"}`;
}

function worldpacEtaLabel(minutes: number): string {
  const hours = minutes / 60;
  if (hours < 1) {
    return `Delivery: ${minutes} mins`;
  }
  const low = Math.floor(hours);
  const high = low + 1;
  return `Delivery: ${low}–${high} hrs`;
}

// ---------------------------------------------------------------------------
// simulatePartLookup — deterministic simulation of a supplier catalogue query
// ---------------------------------------------------------------------------

function simulatePartLookup(query: string): Part[] {
  const q = query.toLowerCase().trim();
  const parts: Part[] = [];

  // Find the best matching template (first keyword match wins)
  const template =
    PART_CATALOG.find((tpl) =>
      tpl.keywords.some((kw) => q.includes(kw)),
    ) ?? GENERIC_TEMPLATE;

  const baseName =
    template === GENERIC_TEMPLATE && q.length > 0
      ? q
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
      : template.baseName;

  // AutoZone results
  template.autoZone.forEach((entry, idx) => {
    const retailPriceCents = toRetailCents(entry.wholesalePriceCents);
    parts.push({
      id: `az-${entry.partNumber}-${idx}`,
      name: idx === 0 ? baseName : `${baseName} — Premium`,
      partNumber: entry.partNumber,
      supplier: "AutoZone",
      wholesalePriceCents: entry.wholesalePriceCents,
      retailPriceCents,
      etaLabel: autoZoneEtaLabel(entry.etaMinutes),
    });
  });

  // Worldpac results
  template.worldpac.forEach((entry, idx) => {
    const retailPriceCents = toRetailCents(entry.wholesalePriceCents);
    parts.push({
      id: `wp-${entry.partNumber}-${idx}`,
      name: idx === 0 ? baseName : `${baseName} — OEM Grade`,
      partNumber: entry.partNumber,
      supplier: "Worldpac",
      wholesalePriceCents: entry.wholesalePriceCents,
      retailPriceCents,
      etaLabel: worldpacEtaLabel(entry.etaMinutes),
    });
  });

  return parts;
}

// ---------------------------------------------------------------------------
// Server Action — lookupParts
// ---------------------------------------------------------------------------

/**
 * Returns simulated supplier results for a given part search query.
 * The work order is fetched to provide vehicle context for future
 * supplier API integration (make/model-specific fitment).
 */
export async function lookupParts(
  workOrderId: string,
  query: string,
): Promise<{ parts: Part[] } | { error: string }> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  const { tenantId } = await verifySession();

  const q = query.trim();
  if (q.length < 2) {
    return { error: "Search query must be at least 2 characters." };
  }

  // Fetch vehicle context to confirm the work order exists; make/model
  // would be used for fitment checks in a production supplier API call.
  try {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { id: true },
    });
    if (!workOrder) {
      return { error: "Work order not found." };
    }
  } catch {
    // Database unavailable in demo — continue without vehicle context.
  }

  const parts = simulatePartLookup(q);
  return { parts };
}

// ---------------------------------------------------------------------------
// Server Action — savePartsToWorkOrder
// ---------------------------------------------------------------------------

/**
 * Persists the finalised parts selection as a JSON array on the active
 * WorkOrder row in Supabase.  Uses the admin client to bypass RLS.
 */
export async function savePartsToWorkOrder(
  workOrderId: string,
  parts: SelectedPart[],
): Promise<ActionResult> {
  if (!workOrderId) {
    return { error: "Cannot save parts: work order ID is missing." };
  }
  if (!Array.isArray(parts) || parts.length === 0) {
    return { error: "Cannot save parts: the parts list is empty." };
  }

  const { tenantId } = await verifySession();

  const adminDb = createAdminClient();

  const { error } = await adminDb
    .from("work_orders")
    .update({ parts_json: parts })
    .eq("id", workOrderId)
    .eq("tenant_id", tenantId);

  if (error) {
    return { error: `Failed to save parts: ${error.message}` };
  }

  return {};
}
