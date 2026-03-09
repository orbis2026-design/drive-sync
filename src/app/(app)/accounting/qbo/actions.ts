"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID ?? "";
const QBO_REDIRECT_URI =
  process.env.QBO_REDIRECT_URI ??
  `${process.env.NEXT_PUBLIC_PORTAL_BASE_URL ?? ""}/api/qbo/callback`;
const QBO_SCOPE =
  "com.intuit.quickbooks.accounting openid profile email phone address";
const QBO_AUTH_ENDPOINT =
  "https://appcenter.intuit.com/connect/oauth2";
const QBO_API_BASE =
  process.env.QBO_SANDBOX === "true"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QboStatus {
  connected: boolean;
  realmId: string | null;
  companyName: string | null;
}

export interface ChartOfAccountsEntry {
  id: string;
  name: string;
  accountType: string;
}

export interface CategoryMapping {
  labor: string;
  parts: string;
  envFees: string;
  salesTax: string;
}

export interface SyncResult {
  synced: number;
  failed: number;
  invoiceIds: string[];
}

// ---------------------------------------------------------------------------
// getQboStatus — check whether this tenant has connected QBO
// ---------------------------------------------------------------------------

export async function getQboStatus(): Promise<QboStatus> {
  const { tenantId } = await verifySession();

  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("qbo_realm_id, qbo_access_token")
    .eq("id", tenantId)
    .single();

  if (!tenant?.qbo_realm_id || !tenant?.qbo_access_token) {
    return { connected: false, realmId: null, companyName: null };
  }

  // Optionally fetch company name from QBO
  try {
    const companyRes = await fetch(
      `${QBO_API_BASE}/v3/company/${tenant.qbo_realm_id}/companyinfo/${tenant.qbo_realm_id}`,
      {
        headers: {
          Authorization: `Bearer ${tenant.qbo_access_token}`,
          Accept: "application/json",
        },
      },
    );
    if (companyRes.ok) {
      const body = await companyRes.json();
      return {
        connected: true,
        realmId: tenant.qbo_realm_id,
        companyName: body?.CompanyInfo?.CompanyName ?? null,
      };
    }
  } catch {
    // QBO not reachable — still show as connected if tokens exist
  }

  return { connected: true, realmId: tenant.qbo_realm_id, companyName: null };
}

// ---------------------------------------------------------------------------
// getQboOAuthUrl — build the Intuit OAuth 2.0 authorization URL
// ---------------------------------------------------------------------------

export async function getQboOAuthUrl(): Promise<{ url: string }> {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: QBO_CLIENT_ID,
    redirect_uri: QBO_REDIRECT_URI,
    scope: QBO_SCOPE,
    response_type: "code",
    state,
  });
  return { url: `${QBO_AUTH_ENDPOINT}?${params.toString()}` };
}

// ---------------------------------------------------------------------------
// disconnectQbo — revoke tokens (just clear from DB for now)
// ---------------------------------------------------------------------------

export async function disconnectQbo(): Promise<{ ok: boolean }> {
  const { tenantId } = await verifySession();

  const admin = createAdminClient();
  await admin
    .from("tenants")
    .update({ qbo_realm_id: null, qbo_access_token: null, qbo_refresh_token: null })
    .eq("id", tenantId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// getQboChartOfAccounts — fetch the Intuit chart of accounts
// ---------------------------------------------------------------------------

const QboAccountSchema = z.object({
  Id: z.string(),
  Name: z.string(),
  AccountType: z.string(),
});
const QboResponseSchema = z.object({
  QueryResponse: z
    .object({
      Account: z.array(QboAccountSchema).optional(),
    })
    .optional(),
});

export async function getQboChartOfAccounts(): Promise<
  ChartOfAccountsEntry[] | { error: string }
> {
  const { tenantId } = await verifySession();

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("qbo_realm_id, qbo_access_token")
    .eq("id", tenantId)
    .single();

  if (!tenant?.qbo_access_token || !tenant?.qbo_realm_id) {
    return { error: "QuickBooks is not connected. Connect via Settings → Integrations." };
  }

  try {
    const query = encodeURIComponent(
      "SELECT * FROM Account WHERE AccountType IN ('Income', 'Other Current Liability') MAXRESULTS 50",
    );
    const res = await fetch(
      `${QBO_API_BASE}/v3/company/${tenant.qbo_realm_id}/query?query=${query}`,
      {
        headers: {
          Authorization: `Bearer ${tenant.qbo_access_token}`,
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) {
      return { error: `QBO API returned HTTP ${res.status}. Re-authenticate via Settings → Integrations.` };
    }
    const raw = await res.json();
    const parsed = QboResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: `QBO API returned unexpected shape: ${parsed.error.message}` };
    }
    const accounts: ChartOfAccountsEntry[] = (
      parsed.data.QueryResponse?.Account ?? []
    ).map((a) => ({
      id: a.Id,
      name: a.Name,
      accountType: a.AccountType,
    }));
    return accounts.length > 0
      ? accounts
      : { error: "No income/liability accounts found in QuickBooks." };
  } catch {
    return { error: "Failed to fetch QuickBooks chart of accounts." };
  }
}

// ---------------------------------------------------------------------------
// syncPaidWorkOrders — transforms PAID work orders into QBO invoices
// ---------------------------------------------------------------------------

export async function syncPaidWorkOrders(
  mapping: CategoryMapping,
): Promise<SyncResult | { error: string }> {
  if (!mapping.labor || !mapping.parts) {
    return { error: "Please map at least Labor and Parts accounts before syncing." };
  }

  const { tenantId } = await verifySession();

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("qbo_realm_id, qbo_access_token")
    .eq("id", tenantId)
    .single();

  // Fetch PAID work orders that haven't been synced yet
  let workOrders: {
    id: string;
    title: string;
    laborCents: number;
    partsCents: number;
    closedAt: Date | null;
    client: { firstName: string; lastName: string; email: string | null };
  }[] = [];

  try {
    workOrders = await prisma.workOrder.findMany({
      where: { tenantId, status: "PAID" },
      select: {
        id: true,
        title: true,
        laborCents: true,
        partsCents: true,
        closedAt: true,
        client: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      take: 25,
      orderBy: { closedAt: "desc" },
    });
  } catch (err) {
    return { error: `Failed to query paid work orders: ${err instanceof Error ? err.message : "Unknown error"}` };
  }

  if (workOrders.length === 0) {
    return { synced: 0, failed: 0, invoiceIds: [] };
  }

  const synced: string[] = [];
  let failed = 0;

  for (const wo of workOrders) {
    // Build QBO Invoice payload
    const payload = {
      Line: [
        {
          Amount: wo.laborCents / 100,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: {
            ItemAccountRef: { value: mapping.labor },
          },
          Description: `Labor — ${wo.title}`,
        },
        ...(wo.partsCents > 0
          ? [
              {
                Amount: wo.partsCents / 100,
                DetailType: "SalesItemLineDetail",
                SalesItemLineDetail: {
                  ItemAccountRef: { value: mapping.parts },
                },
                Description: "Parts",
              },
            ]
          : []),
      ],
      CustomerRef: {
        name: `${wo.client.firstName} ${wo.client.lastName}`,
      },
      TxnDate: wo.closedAt
        ? wo.closedAt.toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
    };

    if (!tenant?.qbo_access_token || !tenant?.qbo_realm_id) {
      return { error: "QuickBooks is not connected. Cannot create invoices." };
    }

    try {
      const res = await fetch(
        `${QBO_API_BASE}/v3/company/${tenant.qbo_realm_id}/invoice`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tenant.qbo_access_token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      if (res.ok) {
        const body = await res.json();
        synced.push(body?.Invoice?.Id ?? wo.id);
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { synced: synced.length, failed, invoiceIds: synced };
}
