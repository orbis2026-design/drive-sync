/**
 * tests/fixtures/seed-data.ts
 *
 * Issue #74 — Database seeding utilities for the Golden Path E2E test.
 *
 * Inserts a minimal Tenant + Client row via the Supabase service-role REST API
 * so the golden-path test has stable, predictable data to work with.
 * All seeded rows carry the `E2E_` prefix on string identifiers so they can be
 * cleaned up easily after test runs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeededTenant {
  id: string;
  name: string;
}

export interface SeededClient {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  tenantId: string;
}

export interface SeedResult {
  tenant: SeededTenant;
  client: SeededClient;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID ?? "";

const isStub =
  !SUPABASE_URL ||
  SUPABASE_URL.includes("stub") ||
  !SUPABASE_SERVICE_KEY ||
  SUPABASE_SERVICE_KEY.includes("stub");

// ---------------------------------------------------------------------------
// Supabase REST helpers
// ---------------------------------------------------------------------------

async function supabasePost(
  table: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase POST /${table} failed (${res.status}): ${text}`);
  }

  const rows = (await res.json()) as Record<string, unknown>[];
  return rows[0] ?? {};
}

async function supabaseDelete(
  table: string,
  column: string,
  value: string,
): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Insert a test Tenant and Client into the local database.
 * Returns stub data when Supabase is not available (CI without a real DB).
 */
export async function seedGoldenPathData(): Promise<SeedResult> {
  if (isStub) {
    // Return deterministic stub data so tests can run in degraded CI mode.
    return {
      tenant: { id: "stub-tenant-id", name: "E2E Test Garage" },
      client: {
        id: "stub-client-id",
        firstName: "Golden",
        lastName: "PathClient",
        email: "golden.client@e2e.test",
        tenantId: "stub-tenant-id",
      },
    };
  }

  // Use the pre-configured demo tenant when available, otherwise insert one.
  let tenantId = DEMO_TENANT_ID;
  let tenantName = "E2E Test Garage";

  if (!tenantId) {
    const tenantRow = await supabasePost("tenants", {
      name: tenantName,
      slug: `e2e-test-garage-${Date.now()}`,
    });
    tenantId = tenantRow.id as string;
  }

  const clientRow = await supabasePost("clients", {
    tenant_id: tenantId,
    first_name: "Golden",
    last_name: "PathClient",
    email: `golden.client.${Date.now()}${Math.floor(Math.random() * 10000)}@e2e.test`,
    phone: "555-0199",
  });

  return {
    tenant: { id: tenantId, name: tenantName },
    client: {
      id: clientRow.id as string,
      firstName: "Golden",
      lastName: "PathClient",
      email: clientRow.email as string,
      tenantId,
    },
  };
}

/**
 * Remove the test client inserted by `seedGoldenPathData`.
 * The tenant row is preserved if it was the pre-existing DEMO_TENANT_ID.
 */
export async function teardownGoldenPathData(seed: SeedResult): Promise<void> {
  if (isStub) return;

  await supabaseDelete("clients", "id", seed.client.id);

  // Only delete the tenant if we created it (not the demo tenant).
  if (seed.tenant.id !== DEMO_TENANT_ID) {
    await supabaseDelete("tenants", "id", seed.tenant.id);
  }
}
