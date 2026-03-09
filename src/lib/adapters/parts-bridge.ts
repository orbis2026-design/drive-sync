/**
 * parts-bridge.ts — Nexpart (WHI) SOAP/REST Parts Bridge Adapter
 *
 * Provides a clean adapter for fetching live parts pricing from commercial
 * supplier accounts (Nexpart/WHI, O'Reilly, AutoZone, etc.) on a per-mechanic
 * basis. Each mechanic's `supplier_credentials_json` supplies the connection
 * details, so multiple tenants can have separate accounts with different
 * distributors.
 *
 * Authentication supports both:
 *   • WHI/Nexpart style: username + password → token exchange
 *   • OAuth 2.0 style: clientId + clientSecret → access_token
 *   • Pre-issued token: token field used directly as Bearer
 *
 * In development / CI the mock implementation returns realistic brake pad,
 * rotor, and filter results keyed by VIN year/make/model so the UI is fully
 * exercisable without live vendor credentials.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-tenant supplier credentials stored in `tenants.supplier_credentials_json`. */
export interface SupplierCredentials {
  /** Base URL of the supplier's REST API (e.g. https://api.nexpart.com/v2). */
  baseUrl: string;
  /**
   * WHI/Nexpart username (commercial account login).
   * When present alongside `password`, used for token-exchange auth.
   */
  username?: string;
  /**
   * WHI/Nexpart password (commercial account password).
   * Paired with `username` for the /auth/token exchange.
   */
  password?: string;
  /**
   * Pre-issued API token. Skips the token-exchange step entirely.
   * Takes precedence over username/password when set.
   */
  token?: string;
  /** OAuth 2.0 client ID (legacy OAuth flow). */
  clientId?: string;
  /** OAuth 2.0 client secret (legacy OAuth flow). */
  clientSecret?: string;
  /** API key passed in the `X-Api-Key` header (legacy key-based flow). */
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Error types thrown by the bridge to allow route handlers to return precise HTTP codes. */
export type PartsBridgeErrorType = "UNAUTHORIZED" | "NOT_FOUND" | "UPSTREAM_ERROR";

/** Structured error thrown by PartsBridgeAdapter for known failure modes. */
export class PartsBridgeError extends Error {
  constructor(
    public readonly type: PartsBridgeErrorType,
    message: string,
  ) {
    super(message);
    this.name = "PartsBridgeError";
  }
}

// ---------------------------------------------------------------------------
// PartsSearchResult
// ---------------------------------------------------------------------------

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
// In-memory token cache (per-credentials, keyed by baseUrl+username)
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
   * Obtains (or returns a cached) Bearer token for the given credentials.
   * Tokens are cached in a module-level Map keyed by `baseUrl+username`;
   * each entry is reused until within `TOKEN_REFRESH_BUFFER_MS` of expiry.
   *
   * Auth priority:
   *   1. `token` field — used directly (no exchange needed).
   *   2. `username` + `password` — POST to `/auth/token` (WHI/Nexpart style).
   *   3. `clientId` + `clientSecret` — OAuth 2.0 client_credentials flow.
   *   4. Dev fallback — synthetic token (no network call).
   *
   * @throws {PartsBridgeError} type="UNAUTHORIZED" if the exchange returns 401.
   */
  async getToken(credentials: SupplierCredentials): Promise<string> {
    const cacheKey = `${credentials.baseUrl}::${credentials.username ?? credentials.clientId ?? "anon"}`;
    const cached = _tokenCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt - now > TOKEN_REFRESH_BUFFER_MS) {
      return cached.accessToken;
    }

    // --- Pre-issued token (highest priority) --------------------------------
    if (credentials.token) {
      const entry: CachedToken = {
        accessToken: credentials.token,
        expiresAt: now + 3_600_000, // treat as 1-hour validity
      };
      _tokenCache.set(cacheKey, entry);
      return entry.accessToken;
    }

    // --- WHI/Nexpart username+password token exchange -----------------------
    if (credentials.username && credentials.password) {
      const tokenUrl = `${credentials.baseUrl.replace(/\/$/, "")}/auth/token`;
      let res: Response;
      try {
        res = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: credentials.username,
            password: credentials.password,
            grant_type: "password",
          }),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new PartsBridgeError("UPSTREAM_ERROR", `Token endpoint unreachable: ${msg}`);
      }

      if (res.status === 401) {
        throw new PartsBridgeError(
          "UNAUTHORIZED",
          "Supplier account credentials are invalid or the commercial account has expired.",
        );
      }

      if (!res.ok) {
        throw new PartsBridgeError(
          "UPSTREAM_ERROR",
          `Token exchange failed with HTTP ${res.status}.`,
        );
      }

      const json = await res.json() as { access_token?: string; token?: string; expires_in?: number };
      const accessToken = json.access_token ?? json.token;
      if (!accessToken) {
        throw new PartsBridgeError("UPSTREAM_ERROR", "Token response missing access_token field.");
      }

      const expiresIn = typeof json.expires_in === "number" ? json.expires_in * 1000 : 3_600_000;
      const entry: CachedToken = { accessToken, expiresAt: now + expiresIn };
      _tokenCache.set(cacheKey, entry);
      return accessToken;
    }

    // --- OAuth 2.0 client_credentials flow ----------------------------------
    if (credentials.clientId && credentials.clientSecret) {
      const tokenUrl = `${credentials.baseUrl.replace(/\/$/, "")}/oauth/token`;
      let res: Response;
      try {
        res = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
          }),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new PartsBridgeError("UPSTREAM_ERROR", `OAuth endpoint unreachable: ${msg}`);
      }

      if (res.status === 401) {
        throw new PartsBridgeError(
          "UNAUTHORIZED",
          "OAuth credentials rejected. The supplier API key may have expired.",
        );
      }

      if (!res.ok) {
        throw new PartsBridgeError("UPSTREAM_ERROR", `OAuth token request failed with HTTP ${res.status}.`);
      }

      const json = await res.json() as { access_token?: string; expires_in?: number };
      const accessToken = json.access_token;
      if (!accessToken) {
        throw new PartsBridgeError("UPSTREAM_ERROR", "OAuth response missing access_token field.");
      }

      const expiresIn = typeof json.expires_in === "number" ? json.expires_in * 1000 : 3_600_000;
      const entry: CachedToken = { accessToken, expiresAt: now + expiresIn };
      _tokenCache.set(cacheKey, entry);
      return accessToken;
    }

    // --- Dev / test fallback (no real credentials configured) ----------------
    if (process.env.NODE_ENV === "production") {
      throw new PartsBridgeError(
        "UNAUTHORIZED",
        "No supplier credentials configured. Set supplier_credentials_json on the tenant record.",
      );
    }
    const devToken: CachedToken = {
      accessToken: `dev-bridge-token-${now}`,
      expiresAt: now + 3_600_000,
    };
    _tokenCache.set(cacheKey, devToken);
    return devToken.accessToken;
  }

  // -------------------------------------------------------------------------
  // searchParts
  // -------------------------------------------------------------------------

  /**
   * Fetches live parts pricing from the supplier identified by `credentials`.
   *
   * When live credentials are configured (`username`/`password`/`token` or
   * OAuth), issues a real JSON request to the supplier API and maps the
   * response to the internal `PartsSearchResult[]` schema.
   *
   * Falls back to the local mock catalogue when no real credentials are
   * present so the full UI flow is exercisable in development without a live
   * vendor account.
   *
   * @param query - Free-text search (e.g. "brake pads", "oil filter").
   * @param vin   - 17-character VIN used to filter fitment-compatible results.
   * @param credentials - Per-tenant supplier connection details.
   * @returns Array of matching parts in the internal `PartsSearchResult` schema.
   *
   * @throws {PartsBridgeError} type="UNAUTHORIZED" — supplier credentials
   *   expired or invalid (mechanic's commercial account needs renewal).
   * @throws {PartsBridgeError} type="NOT_FOUND" — no parts found at the
   *   local warehouse (out of stock or unrecognised part number).
   * @throws {PartsBridgeError} type="UPSTREAM_ERROR" — supplier API returned
   *   an unexpected error.
   */
  async searchParts(
    query: string,
    vin: string,
    credentials: SupplierCredentials,
  ): Promise<PartsSearchResult[]> {
    // Obtain (or refresh) the auth token.
    const token = await this.getToken(credentials);

    const hasLiveCredentials = Boolean(
      credentials.token ||
      (credentials.username && credentials.password) ||
      (credentials.clientId && credentials.clientSecret),
    );

    // --- Live implementation (real supplier API) ----------------------------
    if (hasLiveCredentials) {
      const searchUrl = `${credentials.baseUrl.replace(/\/$/, "")}/parts/search`;

      // Build the WHI-compatible JSON search payload.
      const payload = {
        query,
        vin,
        // Include the API key in the body when provided (some WHI implementations
        // require it here in addition to the Authorization header).
        ...(credentials.apiKey ? { apiKey: credentials.apiKey } : {}),
      };

      let res: Response;
      try {
        res = await fetch(searchUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            ...(credentials.apiKey ? { "X-Api-Key": credentials.apiKey } : {}),
          },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new PartsBridgeError("UPSTREAM_ERROR", `Parts search endpoint unreachable: ${msg}`);
      }

      if (res.status === 401) {
        // Clear the cached token so the next request forces a fresh exchange.
        const cacheKey = `${credentials.baseUrl}::${credentials.username ?? credentials.clientId ?? "anon"}`;
        _tokenCache.delete(cacheKey);
        throw new PartsBridgeError(
          "UNAUTHORIZED",
          "Supplier account credentials are expired. Please renew the commercial parts account.",
        );
      }

      if (res.status === 404) {
        // Out of stock / part not carried at the local warehouse.
        throw new PartsBridgeError(
          "NOT_FOUND",
          "No matching parts found at the local warehouse. The part may be out of stock.",
        );
      }

      if (!res.ok) {
        throw new PartsBridgeError(
          "UPSTREAM_ERROR",
          `Parts search failed with HTTP ${res.status}.`,
        );
      }

      // Map the live response to our internal schema.
      const data = await res.json() as {
        results?: unknown[];
        parts?: unknown[];
        data?: unknown[];
      };

      const rawParts = data.results ?? data.parts ?? data.data ?? [];
      return (rawParts as Record<string, unknown>[]).map((p) => ({
        partNumber: String(p.partNumber ?? p.part_number ?? p.sku ?? ""),
        name: String(p.name ?? p.description ?? "Unknown Part"),
        brand: String(p.brand ?? p.manufacturer ?? ""),
        wholesaleCostCents: Math.round(
          (typeof p.wholesaleCost === "number" ? p.wholesaleCost :
           typeof p.wholesale_cost === "number" ? p.wholesale_cost :
           typeof p.cost === "number" ? p.cost : 0) * 100,
        ),
        retailSuggestedCents: Math.round(
          (typeof p.retailPrice === "number" ? p.retailPrice :
           typeof p.retail_price === "number" ? p.retail_price :
           typeof p.price === "number" ? p.price : 0) * 100,
        ),
        availabilityCount: typeof p.qty === "number" ? p.qty :
          typeof p.quantity === "number" ? p.quantity :
          typeof p.availableQty === "number" ? p.availableQty : 0,
        etaMinutes: typeof p.etaMinutes === "number" ? p.etaMinutes :
          typeof p.eta_minutes === "number" ? p.eta_minutes : 0,
        supplier: String(p.supplier ?? p.source ?? credentials.baseUrl),
        fitment: null,
      }));
    }

    // --- Dev / test mock (no live credentials configured) -------------------
    if (process.env.NODE_ENV === "production") {
      throw new PartsBridgeError(
        "UNAUTHORIZED",
        "No supplier credentials configured for production parts search.",
      );
    }
    const { year, make } = parseVin(vin);
    const queryLower = query.toLowerCase().trim();

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
