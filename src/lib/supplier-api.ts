/**
 * supplier-api.ts — Generic B2B Parts Supplier Integration Utility
 *
 * Provides a uniform interface for authenticating with and querying a wholesale
 * parts distributor (modelled after Nexpart / Epicor EpicLink).
 *
 * In production (`NODE_ENV=production`) all four environment variables below
 * **must** be set to real vendor credentials. The module will throw at import
 * time if any are missing so that mock data never leaks into live deployments.
 *
 * In development / test the mock catalogue is used when credentials are absent,
 * allowing the full UI flow to be exercised without a live vendor account.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const SUPPLIER_BASE_URL = process.env.SUPPLIER_API_BASE_URL ?? "";
const SUPPLIER_CLIENT_ID = process.env.SUPPLIER_CLIENT_ID ?? "";
const SUPPLIER_CLIENT_SECRET = process.env.SUPPLIER_CLIENT_SECRET ?? "";
const SUPPLIER_API_KEY = process.env.SUPPLIER_API_KEY ?? "";

/** True when real supplier credentials are configured. */
const HAS_REAL_CREDENTIALS =
  SUPPLIER_BASE_URL !== "" &&
  SUPPLIER_CLIENT_ID !== "" &&
  SUPPLIER_CLIENT_SECRET !== "" &&
  SUPPLIER_API_KEY !== "";

if (IS_PRODUCTION && !HAS_REAL_CREDENTIALS) {
  throw new Error(
    "[supplier-api] Production environment requires SUPPLIER_API_BASE_URL, " +
      "SUPPLIER_CLIENT_ID, SUPPLIER_CLIENT_SECRET, and SUPPLIER_API_KEY. " +
      "Set these environment variables to real vendor credentials.",
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeliveryType = "WILL_CALL" | "DELIVERY";

export interface SupplierPart {
  partNumber: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  wholesalePriceCents: number;
  /** Retail price at a 40% gross-margin mark-up. */
  retailPriceCents: number;
  etaMinutes: number;
  inStock: boolean;
  warehouseQty: number;
  /** Supplier source name (e.g. "AutoZone", "Worldpac"). */
  source: string;
  /** Direct URL to the part on the supplier's website for reference. */
  sourceUrl: string;
  /**
   * SAME_DAY: ETA ≤ 120 minutes (local warehouse stock ready today).
   * ORDER_ONLY: ETA > 120 minutes (requires supplier back-order or transfer).
   */
  availabilityType: "SAME_DAY" | "ORDER_ONLY";
  fitment: {
    yearStart: number;
    yearEnd: number;
    makes: string[];
    models: string[];
  };
}

export interface InventoryResult {
  partNumber: string;
  warehouseId: string;
  inStock: boolean;
  qty: number;
  /** Estimated minutes until the part is ready for will-call or in transit. */
  etaMinutes: number;
}

export interface PurchaseOrderLine {
  partNumber: string;
  qty: number;
  wholesalePriceCents: number;
}

export interface PurchaseOrderResult {
  poNumber: string;
  status: "CONFIRMED" | "PENDING" | "ERROR";
  deliveryType: DeliveryType;
  estimatedReadyAt: string; // ISO-8601
  lines: PurchaseOrderLine[];
}

export interface AuthToken {
  accessToken: string;
  expiresAt: number; // Unix epoch ms
}

// ---------------------------------------------------------------------------
// Token cache (module-level singleton, reset each cold-start)
// ---------------------------------------------------------------------------

let _cachedToken: AuthToken | null = null;

// ---------------------------------------------------------------------------
// OAuth / API-key authentication
// ---------------------------------------------------------------------------

/**
 * Obtains (or returns a cached) OAuth 2.0 Bearer token from the supplier.
 * The supplier supports both OAuth client_credentials and API-key flows;
 * we attempt OAuth first and fall back to the API key header.
 */
export async function getSupplierToken(): Promise<AuthToken> {
  const now = Date.now();

  // Return cached token if it is still valid (60 s safety buffer).
  if (_cachedToken && _cachedToken.expiresAt - now > 60_000) {
    return _cachedToken;
  }

  if (HAS_REAL_CREDENTIALS) {
    // --- Real OAuth 2.0 client_credentials flow ----------------------------
    const res = await fetch(`${SUPPLIER_BASE_URL}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Api-Key": SUPPLIER_API_KEY,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: SUPPLIER_CLIENT_ID,
        client_secret: SUPPLIER_CLIENT_SECRET,
      }),
    });

    if (!res.ok) {
      throw new Error(`Supplier OAuth failed: HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) {
      throw new Error("Supplier OAuth response missing access_token.");
    }

    const expiresIn =
      typeof json.expires_in === "number"
        ? json.expires_in * 1000
        : 3_600_000;
    _cachedToken = {
      accessToken: json.access_token,
      expiresAt: now + expiresIn,
    };
    return _cachedToken;
  }

  // --- Dev / test fallback (no live vendor account) ------------------------
  if (IS_PRODUCTION) {
    throw new Error(
      "[supplier-api] Production requires supplier credentials. Set SUPPLIER_BASE_URL, SUPPLIER_CLIENT_ID, SUPPLIER_CLIENT_SECRET.",
    );
  }
  console.warn(
    "[supplier-api] Using dev-only mock bearer token. Set supplier credentials for real API access.",
  );
  _cachedToken = {
    accessToken: `mock-bearer-${Date.now()}`,
    expiresAt: now + 3_600_000,
  };
  return _cachedToken;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toRetailCents(wholesale: number): number {
  return Math.ceil(wholesale / 0.6);
}

function etaLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

// ---------------------------------------------------------------------------
// Mock parts catalogue — dev / test only (gated by HAS_REAL_CREDENTIALS)
// ---------------------------------------------------------------------------

interface MockEntry {
  partNumber: string;
  name: string;
  brand: string;
  wholesalePriceCents: number;
  etaMinutes: number;
  warehouseQty: number;
  category: string;
  subcategory: string;
  /** Supplier source name. */
  source: "AutoZone" | "Worldpac";
}

const MOCK_CATALOGUE: MockEntry[] = [
  // Brakes — Rotors
  {
    partNumber: "NP-BR-OEM-FRONT-1",
    name: "Front Brake Rotor — OEM",
    brand: "DuraStop",
    category: "Brakes",
    subcategory: "Rotors",
    wholesalePriceCents: 6200,
    etaMinutes: 45,
    warehouseQty: 8,
    source: "AutoZone",
  },
  {
    partNumber: "NP-BR-CER-FRONT-1",
    name: "Front Brake Rotor — Drilled & Slotted",
    brand: "PowerStop",
    category: "Brakes",
    subcategory: "Rotors",
    wholesalePriceCents: 9800,
    etaMinutes: 90,
    warehouseQty: 3,
    source: "Worldpac",
  },
  // Brakes — Pads
  {
    partNumber: "NP-BP-CER-FRONT-1",
    name: "Front Brake Pads — Ceramic",
    brand: "Akebono",
    category: "Brakes",
    subcategory: "Pads — Ceramic",
    wholesalePriceCents: 5400,
    etaMinutes: 45,
    warehouseQty: 12,
    source: "AutoZone",
  },
  {
    partNumber: "NP-BP-SEM-FRONT-1",
    name: "Front Brake Pads — Semi-Metallic",
    brand: "Wagner",
    category: "Brakes",
    subcategory: "Pads — Semi-Metallic",
    wholesalePriceCents: 3800,
    etaMinutes: 30,
    warehouseQty: 20,
    source: "AutoZone",
  },
  // Engine — Filters
  {
    partNumber: "NP-EF-OIL-1",
    name: "Oil Filter",
    brand: "Mobil 1",
    category: "Engine",
    subcategory: "Filters",
    wholesalePriceCents: 1100,
    etaMinutes: 25,
    warehouseQty: 50,
    source: "AutoZone",
  },
  {
    partNumber: "NP-EF-AIR-1",
    name: "Engine Air Filter",
    brand: "K&N",
    category: "Engine",
    subcategory: "Filters",
    wholesalePriceCents: 2400,
    etaMinutes: 25,
    warehouseQty: 18,
    source: "AutoZone",
  },
  // Engine — Ignition
  {
    partNumber: "NP-IG-SP-1",
    name: "Iridium Spark Plugs (Set of 4)",
    brand: "NGK",
    category: "Engine",
    subcategory: "Ignition",
    wholesalePriceCents: 4800,
    etaMinutes: 30,
    warehouseQty: 10,
    source: "Worldpac",
  },
  {
    partNumber: "NP-IG-COIL-1",
    name: "Ignition Coil Pack",
    brand: "Delphi",
    category: "Engine",
    subcategory: "Ignition",
    wholesalePriceCents: 8900,
    etaMinutes: 60,
    warehouseQty: 5,
    source: "Worldpac",
  },
  // Suspension — Shocks
  {
    partNumber: "NP-SU-SH-FRONT-1",
    name: "Front Shock Absorber",
    brand: "KYB",
    category: "Suspension",
    subcategory: "Shocks & Struts",
    wholesalePriceCents: 7200,
    etaMinutes: 180,
    warehouseQty: 4,
    source: "Worldpac",
  },
  // Steering — Tie Rods
  {
    partNumber: "NP-ST-TR-OUTER-1",
    name: "Outer Tie Rod End",
    brand: "Moog",
    category: "Steering",
    subcategory: "Tie Rods",
    wholesalePriceCents: 3400,
    etaMinutes: 45,
    warehouseQty: 7,
    source: "AutoZone",
  },
  // Electrical — Sensors
  {
    partNumber: "NP-EL-O2-UP-1",
    name: "Upstream Oxygen Sensor",
    brand: "Bosch",
    category: "Electrical",
    subcategory: "Sensors",
    wholesalePriceCents: 6100,
    etaMinutes: 60,
    warehouseQty: 6,
    source: "Worldpac",
  },
  {
    partNumber: "NP-EL-MAF-1",
    name: "Mass Airflow Sensor",
    brand: "Standard Motor",
    category: "Electrical",
    subcategory: "Sensors",
    wholesalePriceCents: 9200,
    etaMinutes: 240,
    warehouseQty: 3,
    source: "Worldpac",
  },
  // Cooling
  {
    partNumber: "NP-CL-WP-1",
    name: "Water Pump",
    brand: "GMB",
    category: "Cooling",
    subcategory: "Water Pumps",
    wholesalePriceCents: 8400,
    etaMinutes: 90,
    warehouseQty: 5,
    source: "Worldpac",
  },
  {
    partNumber: "NP-CL-TH-1",
    name: "Thermostat & Housing Assembly",
    brand: "Stant",
    category: "Cooling",
    subcategory: "Thermostats",
    wholesalePriceCents: 3200,
    etaMinutes: 45,
    warehouseQty: 9,
    source: "AutoZone",
  },
];

// Build category tree from the flat catalogue.
type CategoryTree = Record<string, string[]>;

export async function getCategoryTree(): Promise<CategoryTree> {
  if (HAS_REAL_CREDENTIALS) {
    const token = await getSupplierToken();
    const res = await fetch(`${SUPPLIER_BASE_URL}/categories`, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`Supplier categories fetch failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      categories?: Array<{ name: string; subcategories?: string[] }>;
    };
    const tree: CategoryTree = {};
    for (const cat of body.categories ?? []) {
      tree[cat.name] = cat.subcategories ?? [];
    }
    return tree;
  }

  if (IS_PRODUCTION) {
    throw new Error(
      "[supplier-api] Production requires supplier credentials. Set SUPPLIER_BASE_URL, SUPPLIER_CLIENT_ID, SUPPLIER_CLIENT_SECRET.",
    );
  }

  // --- Dev / test: build tree from mock catalogue --------------------------
  const tree: CategoryTree = {};
  for (const entry of MOCK_CATALOGUE) {
    if (!tree[entry.category]) tree[entry.category] = [];
    if (!tree[entry.category].includes(entry.subcategory)) {
      tree[entry.category].push(entry.subcategory);
    }
  }
  return tree;
}

// ---------------------------------------------------------------------------
// Zod schemas for real API response validation
// ---------------------------------------------------------------------------

const SupplierPartRawSchema = z.object({
  partNumber: z.string().optional(),
  part_number: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  brand: z.string().optional(),
  manufacturer: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  wholesaleCost: z.number().optional(),
  cost: z.number().optional(),
  retailPrice: z.number().optional(),
  price: z.number().optional(),
  etaMinutes: z.number().optional(),
  inStock: z.boolean().optional(),
  qty: z.number().optional(),
  source: z.string().optional(),
  supplier: z.string().optional(),
  sourceUrl: z.string().optional(),
  url: z.string().optional(),
  yearStart: z.number().optional(),
  yearEnd: z.number().optional(),
  makes: z.array(z.string()).optional(),
  models: z.array(z.string()).optional(),
});

const SearchPartsResponseSchema = z.object({
  results: z.array(SupplierPartRawSchema).optional(),
  parts: z.array(SupplierPartRawSchema).optional(),
});

const InventoryResultRawSchema = z.object({
  inStock: z.boolean().optional(),
  qty: z.number().optional(),
  etaMinutes: z.number().optional(),
});

// ---------------------------------------------------------------------------
// searchParts — returns catalogue results for a given category/subcategory
// ---------------------------------------------------------------------------

export interface SearchPartsOptions {
  category?: string;
  subcategory?: string;
  query?: string;
  vehicleYear?: number;
  vehicleMake?: string;
  vehicleModel?: string;
  vin?: string;
}

export async function searchParts(
  options: SearchPartsOptions,
): Promise<SupplierPart[]> {
  const token = await getSupplierToken();

  if (HAS_REAL_CREDENTIALS) {
    // --- Real API call -------------------------------------------------------
    const params = new URLSearchParams();
    if (options.category) params.set("category", options.category);
    if (options.subcategory) params.set("subcategory", options.subcategory);
    if (options.query) params.set("q", options.query);
    if (options.vehicleYear) params.set("year", String(options.vehicleYear));
    if (options.vehicleMake) params.set("make", options.vehicleMake);
    if (options.vehicleModel) params.set("model", options.vehicleModel);
    if (options.vin) params.set("vin", options.vin);

    const res = await fetch(
      `${SUPPLIER_BASE_URL}/parts/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: "application/json",
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Supplier parts search failed: HTTP ${res.status}`);
    }

    const raw = await res.json();
    const parsed = SearchPartsResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Supplier API returned unexpected shape: ${parsed.error.message}`,
      );
    }
    const rawParts = parsed.data.results ?? parsed.data.parts ?? [];
    return rawParts.map((p) => ({
      partNumber: String(p.partNumber ?? p.part_number ?? ""),
      name: String(p.name ?? p.description ?? "Unknown Part"),
      brand: String(p.brand ?? p.manufacturer ?? ""),
      category: String(p.category ?? ""),
      subcategory: String(p.subcategory ?? ""),
      wholesalePriceCents: Math.round(
        (typeof p.wholesaleCost === "number"
          ? p.wholesaleCost
          : typeof p.cost === "number"
            ? p.cost
            : 0) * 100,
      ),
      retailPriceCents: Math.round(
        (typeof p.retailPrice === "number"
          ? p.retailPrice
          : typeof p.price === "number"
            ? p.price
            : 0) * 100,
      ),
      etaMinutes: typeof p.etaMinutes === "number" ? p.etaMinutes : 0,
      inStock: Boolean(p.inStock ?? (typeof p.qty === "number" && p.qty > 0)),
      warehouseQty: typeof p.qty === "number" ? p.qty : 0,
      source: String(p.source ?? p.supplier ?? ""),
      sourceUrl: String(p.sourceUrl ?? p.url ?? ""),
      availabilityType:
        (typeof p.etaMinutes === "number" ? p.etaMinutes : 0) <= 120
          ? ("SAME_DAY" as const)
          : ("ORDER_ONLY" as const),
      fitment: {
        yearStart: typeof p.yearStart === "number" ? p.yearStart : 1990,
        yearEnd: typeof p.yearEnd === "number" ? p.yearEnd : 2026,
        makes: p.makes ?? [],
        models: p.models ?? [],
      },
    }));
  }

  // --- Dev / test mock catalogue -------------------------------------------
  if (IS_PRODUCTION) {
    throw new Error(
      "[supplier-api] Production requires supplier credentials. Set SUPPLIER_BASE_URL, SUPPLIER_CLIENT_ID, SUPPLIER_CLIENT_SECRET.",
    );
  }

  const { category, subcategory, query } = options;

  let results = MOCK_CATALOGUE.filter((e) => {
    if (category && e.category !== category) return false;
    if (subcategory && e.subcategory !== subcategory) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !e.name.toLowerCase().includes(q) &&
        !e.partNumber.toLowerCase().includes(q) &&
        !e.brand.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  // Default: return everything in the category when no subcategory filter.
  if (!category && !subcategory && !query) results = MOCK_CATALOGUE;

  return results.map((e) => {
    const availabilityType: "SAME_DAY" | "ORDER_ONLY" =
      e.etaMinutes <= 120 ? "SAME_DAY" : "ORDER_ONLY";
    // In production these would be real deep-link URLs from the supplier API.
    // In dev / test these are search-page links for reference.
    const sourceUrl =
      e.source === "AutoZone"
        ? `https://www.autozone.com/search?q=${encodeURIComponent(e.partNumber)}`
        : `https://www.worldpac.com/search?q=${encodeURIComponent(e.partNumber)}`;
    return {
      partNumber: e.partNumber,
      name: e.name,
      brand: e.brand,
      category: e.category,
      subcategory: e.subcategory,
      wholesalePriceCents: e.wholesalePriceCents,
      retailPriceCents: toRetailCents(e.wholesalePriceCents),
      etaMinutes: e.etaMinutes,
      inStock: e.warehouseQty > 0,
      warehouseQty: e.warehouseQty,
      source: e.source,
      sourceUrl,
      availabilityType,
      fitment: {
        yearStart: 1990,
        yearEnd: 2026,
        makes: ["Toyota", "Honda", "Ford", "Chevrolet", "BMW", "Nissan"],
        models: [],
      },
    };
  });
}

// ---------------------------------------------------------------------------
// checkInventory — live stock check before adding a part to a quote
// ---------------------------------------------------------------------------

export async function checkInventory(
  partNumber: string,
  warehouseId: string = "WH-MAIN",
): Promise<InventoryResult> {
  const token = await getSupplierToken();

  if (HAS_REAL_CREDENTIALS) {
    const res = await fetch(
      `${SUPPLIER_BASE_URL}/inventory/${encodeURIComponent(partNumber)}?warehouse=${encodeURIComponent(warehouseId)}`,
      {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: "application/json",
        },
      },
    );

    if (!res.ok) {
      return { partNumber, warehouseId, inStock: false, qty: 0, etaMinutes: 0 };
    }

    const raw = await res.json();
    const parsed = InventoryResultRawSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Supplier inventory API returned unexpected shape: ${parsed.error.message}`,
      );
    }
    return {
      partNumber,
      warehouseId,
      inStock: Boolean(
        parsed.data.inStock ??
          (typeof parsed.data.qty === "number" && parsed.data.qty > 0),
      ),
      qty: typeof parsed.data.qty === "number" ? parsed.data.qty : 0,
      etaMinutes:
        typeof parsed.data.etaMinutes === "number" ? parsed.data.etaMinutes : 0,
    };
  }

  // --- Dev / test mock -----------------------------------------------------
  if (IS_PRODUCTION) {
    throw new Error(
      "[supplier-api] Production requires supplier credentials. Set SUPPLIER_BASE_URL, SUPPLIER_CLIENT_ID, SUPPLIER_CLIENT_SECRET.",
    );
  }

  const found = MOCK_CATALOGUE.find((e) => e.partNumber === partNumber);

  if (!found) {
    return {
      partNumber,
      warehouseId,
      inStock: false,
      qty: 0,
      etaMinutes: 0,
    };
  }

  return {
    partNumber,
    warehouseId,
    inStock: found.warehouseQty > 0,
    qty: found.warehouseQty,
    etaMinutes: found.etaMinutes,
  };
}

// ---------------------------------------------------------------------------
// createPurchaseOrder — executes a PO when the client approves the quote
// ---------------------------------------------------------------------------

export async function createPurchaseOrder(
  lines: PurchaseOrderLine[],
  deliveryType: DeliveryType,
): Promise<PurchaseOrderResult> {
  const token = await getSupplierToken();

  if (HAS_REAL_CREDENTIALS) {
    const res = await fetch(`${SUPPLIER_BASE_URL}/purchase-orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ lines, deliveryType }),
    });

    if (!res.ok) {
      throw new Error(`Supplier PO creation failed: HTTP ${res.status}`);
    }

    const body = (await res.json()) as Record<string, unknown>;
    return {
      poNumber: String(body.poNumber ?? body.po_number ?? ""),
      status: (body.status as "CONFIRMED" | "PENDING" | "ERROR") ?? "PENDING",
      deliveryType,
      estimatedReadyAt: String(body.estimatedReadyAt ?? new Date().toISOString()),
      lines,
    };
  }

  // --- Dev / test mock PO --------------------------------------------------

  const totalMinutes =
    deliveryType === "WILL_CALL"
      ? 30
      : Math.max(...lines.map((l) => {
          const e = MOCK_CATALOGUE.find((c) => c.partNumber === l.partNumber);
          return e?.etaMinutes ?? 60;
        }));

  const estimatedReadyAt = new Date(
    Date.now() + totalMinutes * 60 * 1000,
  ).toISOString();

  const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

  return {
    poNumber,
    status: "CONFIRMED",
    deliveryType,
    estimatedReadyAt,
    lines,
  };
}

// ---------------------------------------------------------------------------
// Exported ETA label helper (used in UI)
// ---------------------------------------------------------------------------
export { etaLabel };
