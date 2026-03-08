/**
 * POST /api/parts/search
 *
 * Fetches live parts pricing from the tenant's configured parts supplier
 * (via the PartsBridgeAdapter) and returns matching results.
 *
 * Request body:
 *   { query: string; vin: string; tenantId: string }
 *
 * Responses:
 *   200  { results: PartsSearchResult[] }
 *   400  { error: string }  — missing / invalid body fields
 *   404  { error: string }  — tenant not found or no supplier credentials
 *   500  { error: string }  — unexpected error
 *
 * Environment variables required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  partsBridge,
  PartsBridgeError,
  SupplierCredentials,
} from "@/lib/adapters/parts-bridge";

/** Minimum VIN length accepted (full VINs are 17 chars; allow shorter for dev). */
const MIN_VIN_LENGTH = 5;

export async function POST(req: NextRequest) {
  // --- Parse request body --------------------------------------------------
  let body: { query?: unknown; vin?: unknown; tenantId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { query, vin, tenantId } = body;

  if (typeof query !== "string" || query.trim() === "") {
    return NextResponse.json(
      { error: "query is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  if (typeof vin !== "string" || vin.trim().length < MIN_VIN_LENGTH) {
    return NextResponse.json(
      {
        error: `vin is required and must be at least ${MIN_VIN_LENGTH} characters`,
      },
      { status: 400 },
    );
  }

  if (typeof tenantId !== "string" || tenantId.trim() === "") {
    return NextResponse.json(
      { error: "tenantId is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  // --- Look up tenant supplier credentials ---------------------------------
  let credentials: SupplierCredentials | null = null;
  try {
    const admin = createAdminClient();

    const { data: tenant, error } = await admin
      .from("tenants")
      .select("features_json")
      .eq("id", tenantId.trim())
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Supplier credentials may be stored in a dedicated `supplier_credentials_json`
    // column (Phase 27) or inside `features_json.supplier_credentials` (legacy).
    const featuresJson = tenant.features_json as Record<string, unknown> | null;
    const rawCreds =
      (tenant as Record<string, unknown>).supplier_credentials_json as
        | Partial<SupplierCredentials>
        | undefined
      ?? featuresJson?.supplier_credentials as
        | Partial<SupplierCredentials>
        | undefined;

    // Accept WHI-style (username/password/token) or OAuth-style credentials.
    const hasWhi = rawCreds?.baseUrl && (rawCreds.username || rawCreds.token);
    const hasOauth = rawCreds?.baseUrl && rawCreds.clientId && rawCreds.clientSecret;

    if (hasWhi || hasOauth) {
      credentials = rawCreds as SupplierCredentials;
    } else {
      // Fall back to environment-level demo credentials for development.
      const baseUrl = process.env.SUPPLIER_API_BASE_URL;
      const username = process.env.SUPPLIER_USERNAME;
      const password = process.env.SUPPLIER_PASSWORD;
      const token = process.env.SUPPLIER_TOKEN;
      const clientId = process.env.SUPPLIER_CLIENT_ID;
      const clientSecret = process.env.SUPPLIER_CLIENT_SECRET;
      const apiKey = process.env.SUPPLIER_API_KEY;

      if (baseUrl && (username || token || (clientId && clientSecret))) {
        credentials = { baseUrl, username, password, token, clientId, clientSecret, apiKey };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!credentials) {
    return NextResponse.json(
      {
        error:
          "No supplier credentials configured for this tenant. " +
          "Add supplier_credentials to features_json or set SUPPLIER_* environment variables.",
      },
      { status: 404 },
    );
  }

  // --- Call the PartsBridgeAdapter ------------------------------------------
  try {
    const results = await partsBridge.searchParts(
      query.trim(),
      vin.trim().toUpperCase(),
      credentials,
    );

    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof PartsBridgeError) {
      if (err.type === "UNAUTHORIZED") {
        return NextResponse.json({ error: err.message }, { status: 401 });
      }
      if (err.type === "NOT_FOUND") {
        return NextResponse.json({ error: err.message, results: [] }, { status: 404 });
      }
    }
    const message = err instanceof Error ? err.message : "Parts search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
