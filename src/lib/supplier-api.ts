/**
 * supplier-api.ts — Generic B2B Parts Supplier Integration Utility
 *
 * Provides a uniform interface for authenticating with and querying a wholesale
 * parts distributor (modelled after Nexpart / Epicor EpicLink). In production
 * the environment variables below would be real credentials; in the current
 * state the network calls are intercepted and a rich mock response is returned
 * so that the full UI flow can be exercised without a live vendor account.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPPLIER_BASE_URL =
  process.env.SUPPLIER_API_BASE_URL ?? "https://api.nexpart-mock.internal/v2";
const SUPPLIER_CLIENT_ID =
  process.env.SUPPLIER_CLIENT_ID ?? "demo-client-id";
const SUPPLIER_CLIENT_SECRET =
  process.env.SUPPLIER_CLIENT_SECRET ?? "demo-client-secret";
const SUPPLIER_API_KEY =
  process.env.SUPPLIER_API_KEY ?? "demo-api-key-abc123";

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

  // ---------- Mock implementation (no live vendor account) -----------------
  // In production: POST to `${SUPPLIER_BASE_URL}/oauth/token` with
  // grant_type=client_credentials, client_id, client_secret.
  // -------------------------------------------------------------------------
  void SUPPLIER_BASE_URL;        // suppress "unused" lint warnings
  void SUPPLIER_CLIENT_ID;
  void SUPPLIER_CLIENT_SECRET;
  void SUPPLIER_API_KEY;

  _cachedToken = {
    accessToken: `mock-bearer-${Date.now()}`,
    expiresAt: now + 3_600_000, // 1 hour
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
// Mock parts catalogue (keyed by category → subcategory)
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

export function getCategoryTree(): CategoryTree {
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
// searchParts — returns catalogue results for a given category/subcategory
// ---------------------------------------------------------------------------

export interface SearchPartsOptions {
  category?: string;
  subcategory?: string;
  query?: string;
  vehicleYear?: number;
  vehicleMake?: string;
  vehicleModel?: string;
}

export async function searchParts(
  options: SearchPartsOptions,
): Promise<SupplierPart[]> {
  // In production: POST to `${SUPPLIER_BASE_URL}/parts/search` with
  // the auth token and fitment parameters.
  await getSupplierToken(); // ensure authenticated

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
  await getSupplierToken();

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
  await getSupplierToken();

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
