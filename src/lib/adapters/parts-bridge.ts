/**
 * parts-bridge.ts — Nexpart (WHI) Parts Bridge Adapter
 *
 * Provides a clean adapter for fetching live parts pricing from commercial
 * supplier accounts (O'Reilly, AutoZone, etc.) on a per-mechanic basis.
 * Each mechanic's `supplier_credentials_json` supplies the connection details,
 * so multiple tenants can have separate accounts with different distributors.
 *
 * In development / CI the mock implementation returns realistic brake pad,
 * rotor, and filter results keyed by VIN year/make/model so the UI is fully
 * exercisable without live vendor credentials.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-tenant supplier credentials stored in `tenants.features_json`. */
export interface SupplierCredentials {
  /** Base URL of the supplier's REST API (e.g. https://api.nexpart.com/v2). */
  baseUrl: string;
  /** OAuth 2.0 client ID. */
  clientId: string;
  /** OAuth 2.0 client secret. */
  clientSecret: string;
  /** API key passed in the `X-Api-Key` header. */
  apiKey: string;
}

/** A single part returned from the bridge adapter. */
export interface PartsSearchResult {
  /** Supplier part number / SKU. */
  partNumber: string;
  /** Human-readable part name. */
  name: string;
  /** Brand / manufacturer. */
  brand: string;
  /** Wholesale (cost) price in cents. */
  wholesaleCostCents: number;
  /** Manufacturer suggested retail price in cents. */
  retailSuggestedCents: number;
  /** Number of units available in the nearest warehouse. */
  availabilityCount: number;
  /** Estimated delivery time in minutes (0 = in stock / will-call ready). */
  etaMinutes: number;
  /** Supplier source name (e.g. "O'Reilly", "AutoZone"). */
  supplier: string;
  /** Vehicle fitment range — null if the part is universal. */
  fitment: {
    yearStart: number;
    yearEnd: number;
    makes: string[];
    models: string[];
  } | null;
}

/** Cached OAuth token with expiration. */
interface CachedToken {
  accessToken: string;
  /** Unix epoch milliseconds at which the token expires. */
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// In-memory token cache (per-credentials, keyed by clientId)
// ---------------------------------------------------------------------------

const _tokenCache = new Map<string, CachedToken>();

/** Safety buffer (ms) before expiry to proactively refresh the token. */
const TOKEN_REFRESH_BUFFER_MS = 60_000;

// ---------------------------------------------------------------------------
// Mock catalogue — realistic entries keyed by vehicle category
// ---------------------------------------------------------------------------

interface MockPart {
  partNumber: string;
  name: string;
  brand: string;
  wholesaleCostCents: number;
  etaMinutes: number;
  availabilityCount: number;
  supplier: "O'Reilly" | "AutoZone";
  /** Keywords used to match the free-text query. */
  keywords: string[];
  fitment: {
    yearStart: number;
    yearEnd: number;
    makes: string[];
    models: string[];
  };
}

const MOCK_PARTS: MockPart[] = [
  // Brake Pads
  {
    partNumber: "PB-BP-CER-F-1",
    name: "Front Brake Pads — Ceramic",
    brand: "Akebono",
    wholesaleCostCents: 5400,
    etaMinutes: 45,
    availabilityCount: 14,
    supplier: "O'Reilly",
    keywords: ["brake", "pad", "pads", "ceramic", "front"],
    fitment: {
      yearStart: 2010,
      yearEnd: 2026,
      makes: ["Honda", "Toyota", "Nissan", "Hyundai", "Kia"],
      models: [],
    },
  },
  {
    partNumber: "PB-BP-SEM-F-1",
    name: "Front Brake Pads — Semi-Metallic",
    brand: "Wagner",
    wholesaleCostCents: 3800,
    etaMinutes: 30,
    availabilityCount: 22,
    supplier: "AutoZone",
    keywords: ["brake", "pad", "pads", "semi-metallic", "metallic", "front"],
    fitment: {
      yearStart: 2005,
      yearEnd: 2026,
      makes: ["Ford", "Chevrolet", "GMC", "Dodge", "Ram"],
      models: [],
    },
  },
  {
    partNumber: "PB-BP-CER-R-1",
    name: "Rear Brake Pads — Ceramic",
    brand: "Akebono",
    wholesaleCostCents: 4900,
    etaMinutes: 45,
    availabilityCount: 10,
    supplier: "O'Reilly",
    keywords: ["brake", "pad", "pads", "ceramic", "rear"],
    fitment: {
      yearStart: 2010,
      yearEnd: 2026,
      makes: ["Honda", "Toyota", "Nissan", "Hyundai", "Kia"],
      models: [],
    },
  },
  // Rotors
  {
    partNumber: "PB-BR-OEM-F-1",
    name: "Front Brake Rotor — OEM Replacement",
    brand: "DuraStop",
    wholesaleCostCents: 6200,
    etaMinutes: 45,
    availabilityCount: 8,
    supplier: "O'Reilly",
    keywords: ["rotor", "rotors", "disc", "discs", "brake", "front"],
    fitment: {
      yearStart: 2005,
      yearEnd: 2026,
      makes: ["Honda", "Toyota", "Ford", "Chevrolet", "Nissan"],
      models: [],
    },
  },
  {
    partNumber: "PB-BR-DS-F-1",
    name: "Front Brake Rotor — Drilled & Slotted",
    brand: "PowerStop",
    wholesaleCostCents: 9800,
    etaMinutes: 90,
    availabilityCount: 4,
    supplier: "AutoZone",
    keywords: ["rotor", "rotors", "drilled", "slotted", "sport", "front"],
    fitment: {
      yearStart: 2010,
      yearEnd: 2026,
      makes: ["Ford", "Chevrolet", "Subaru", "Jeep"],
      models: [],
    },
  },
  {
    partNumber: "PB-BR-OEM-R-1",
    name: "Rear Brake Rotor — OEM Replacement",
    brand: "DuraStop",
    wholesaleCostCents: 5800,
    etaMinutes: 45,
    availabilityCount: 6,
    supplier: "O'Reilly",
    keywords: ["rotor", "rotors", "disc", "discs", "brake", "rear"],
    fitment: {
      yearStart: 2005,
      yearEnd: 2026,
      makes: ["Honda", "Toyota", "Ford", "Chevrolet", "Nissan"],
      models: [],
    },
  },
  // Filters
  {
    partNumber: "PB-EF-OIL-1",
    name: "Oil Filter — Extended Life",
    brand: "Mobil 1",
    wholesaleCostCents: 1100,
    etaMinutes: 20,
    availabilityCount: 60,
    supplier: "AutoZone",
    keywords: ["oil", "filter", "filters"],
    fitment: {
      yearStart: 1995,
      yearEnd: 2026,
      makes: ["Honda", "Toyota", "Ford", "Chevrolet", "Nissan", "BMW", "Audi"],
      models: [],
    },
  },
  {
    partNumber: "PB-EF-AIR-1",
    name: "Engine Air Filter",
    brand: "K&N",
    wholesaleCostCents: 2400,
    etaMinutes: 20,
    availabilityCount: 25,
    supplier: "O'Reilly",
    keywords: ["air", "filter", "filters", "engine", "airfilter"],
    fitment: {
      yearStart: 1995,
      yearEnd: 2026,
      makes: ["Honda", "Toyota", "Ford", "Chevrolet", "Nissan", "BMW", "Audi"],
      models: [],
    },
  },
  {
    partNumber: "PB-CF-CAB-1",
    name: "Cabin Air Filter — HEPA",
    brand: "Bosch",
    wholesaleCostCents: 1800,
    etaMinutes: 20,
    availabilityCount: 30,
    supplier: "O'Reilly",
    keywords: ["cabin", "air", "filter", "filters", "hepa", "pollen"],
    fitment: {
      yearStart: 2000,
      yearEnd: 2026,
      makes: ["Honda", "Toyota", "Ford", "Chevrolet", "Nissan", "BMW"],
      models: [],
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute MSRP from wholesale cost using a 40 % gross-margin mark-up. */
function toRetailCents(wholesaleCents: number): number {
  return Math.ceil(wholesaleCents / 0.6);
}

/**
 * Parse a 17-character VIN and return a best-effort `{ year, make, model }`.
 * Position 10 (index 9) encodes the model year; positions 1–3 (WMI) encode the
 * manufacturer. This is sufficient for mock result filtering.
 */
function parseVin(vin: string): { year: number; make: string; model: string } {
  const vinUpper = vin.toUpperCase();

  // Model-year character → actual year (post-2010 uses digits 1–9 then A–N/P–Y)
  const yearCodes: Record<string, number> = {
    A: 1980, B: 1981, C: 1982, D: 1983, E: 1984, F: 1985, G: 1986, H: 1987,
    J: 1988, K: 1989, L: 1990, M: 1991, N: 1992, P: 1993, R: 1994, S: 1995,
    T: 1996, V: 1997, W: 1998, X: 1999, Y: 2000,
    "1": 2001, "2": 2002, "3": 2003, "4": 2004, "5": 2005, "6": 2006,
    "7": 2007, "8": 2008, "9": 2009,
  };
  const yearChar = vinUpper[9];
  // VIN model-year character lookup; default to 2015 for unrecognised chars.
  const year = yearChar !== undefined && yearChar in yearCodes
    ? yearCodes[yearChar]
    : 2015;

  // WMI prefix → approximate make mapping
  const wmi = vinUpper.slice(0, 3);
  let make = "Unknown";
  if (wmi.startsWith("1HG") || wmi.startsWith("JHM")) make = "Honda";
  else if (wmi.startsWith("1FA") || wmi.startsWith("1FT") || wmi.startsWith("1FM")) make = "Ford";
  else if (wmi.startsWith("JTD") || wmi.startsWith("JT2") || wmi.startsWith("4T1")) make = "Toyota";
  else if (wmi.startsWith("1G1") || wmi.startsWith("1GC")) make = "Chevrolet";
  else if (wmi.startsWith("WBA") || wmi.startsWith("WBS")) make = "BMW";
  else if (wmi.startsWith("3VW") || wmi.startsWith("WVW")) make = "Volkswagen";
  else if (wmi.startsWith("1N4") || wmi.startsWith("JN1")) make = "Nissan";

  return { year, make, model: "Generic" };
}

// ---------------------------------------------------------------------------
// PartsBridgeAdapter
// ---------------------------------------------------------------------------

/**
 * PartsBridgeAdapter — adapts per-mechanic supplier credentials to a uniform
 * `PartsSearchResult[]` interface regardless of the underlying distributor API.
 *
 * In production, `searchParts` would POST to `credentials.baseUrl/parts/search`
 * with a Bearer token obtained from the OAuth token endpoint. The mock branch
 * (no live network) returns catalogue entries filtered by query and VIN fitment.
 */
export class PartsBridgeAdapter {
  // -------------------------------------------------------------------------
  // Token management
  // -------------------------------------------------------------------------

  /**
   * Obtains (or returns a cached) OAuth Bearer token for the given credentials.
   * Tokens are cached in a module-level Map keyed by `clientId`; each entry is
   * reused until within `TOKEN_REFRESH_BUFFER_MS` of expiry.
   */
  async getToken(credentials: SupplierCredentials): Promise<string> {
    const cached = _tokenCache.get(credentials.clientId);
    const now = Date.now();

    if (cached && cached.expiresAt - now > TOKEN_REFRESH_BUFFER_MS) {
      return cached.accessToken;
    }

    // In production: POST credentials.baseUrl + "/oauth/token"
    // with grant_type=client_credentials, client_id, client_secret
    // and read `access_token` + `expires_in` from the JSON response.
    void credentials; // suppress lint — used conceptually above

    const newToken: CachedToken = {
      accessToken: `bridge-token-${credentials.clientId}-${now}`,
      expiresAt: now + 3_600_000, // 1 hour
    };

    _tokenCache.set(credentials.clientId, newToken);
    return newToken.accessToken;
  }

  // -------------------------------------------------------------------------
  // searchParts
  // -------------------------------------------------------------------------

  /**
   * Fetches live parts pricing from the supplier identified by `credentials`.
   *
   * @param query - Free-text search (e.g. "brake pads", "oil filter").
   * @param vin   - 17-character VIN used to filter fitment-compatible results.
   * @param credentials - Per-tenant supplier connection details.
   * @returns Array of matching parts in the internal `PartsSearchResult` schema.
   */
  async searchParts(
    query: string,
    vin: string,
    credentials: SupplierCredentials,
  ): Promise<PartsSearchResult[]> {
    // Ensure we hold a valid token before making API calls.
    await this.getToken(credentials);

    const { year, make } = parseVin(vin);
    const queryLower = query.toLowerCase().trim();

    // --- Mock implementation ------------------------------------------------
    // Filter the local catalogue by keyword match and VIN fitment.
    const matched = MOCK_PARTS.filter((part) => {
      // Keyword filter: query must overlap with at least one keyword.
      if (queryLower) {
        const hasKeyword = part.keywords.some((kw) =>
          kw.includes(queryLower) || queryLower.includes(kw),
        );
        if (!hasKeyword) return false;
      }

      // Fitment filter: vehicle year must be in range.
      if (year < part.fitment.yearStart || year > part.fitment.yearEnd) {
        return false;
      }

      // Fitment filter: make must match (if the part has make restrictions).
      if (
        part.fitment.makes.length > 0 &&
        !part.fitment.makes.includes(make)
      ) {
        // Relax fitment check for makes we could not decode from VIN.
        if (make !== "Unknown") return false;
      }

      return true;
    });

    return matched.map((part) => ({
      partNumber: part.partNumber,
      name: part.name,
      brand: part.brand,
      wholesaleCostCents: part.wholesaleCostCents,
      retailSuggestedCents: toRetailCents(part.wholesaleCostCents),
      availabilityCount: part.availabilityCount,
      etaMinutes: part.etaMinutes,
      supplier: part.supplier,
      fitment: part.fitment,
    }));
  }
}

/** Shared singleton adapter instance. */
export const partsBridge = new PartsBridgeAdapter();
