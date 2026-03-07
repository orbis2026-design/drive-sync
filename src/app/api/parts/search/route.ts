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
import { partsBridge, SupplierCredentials } from "@/lib/adapters/parts-bridge";

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

    // Supplier credentials are stored under the `supplier_credentials` key
    // inside the `features_json` JSONB column.
    const featuresJson = tenant.features_json as Record<string, unknown> | null;
    const supplierCreds = featuresJson?.supplier_credentials as
      | Partial<SupplierCredentials>
      | undefined;

    if (
      supplierCreds?.baseUrl &&
      supplierCreds.clientId &&
      supplierCreds.clientSecret &&
      supplierCreds.apiKey
    ) {
      credentials = supplierCreds as SupplierCredentials;
    } else {
      // Fall back to environment-level demo credentials for development.
      const baseUrl = process.env.SUPPLIER_API_BASE_URL;
      const clientId = process.env.SUPPLIER_CLIENT_ID;
      const clientSecret = process.env.SUPPLIER_CLIENT_SECRET;
      const apiKey = process.env.SUPPLIER_API_KEY;

      if (baseUrl && clientId && clientSecret && apiKey) {
        credentials = { baseUrl, clientId, clientSecret, apiKey };
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
    const message = err instanceof Error ? err.message : "Parts search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
