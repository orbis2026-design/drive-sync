/**
 * src/lib/auth.ts
 *
 * Server-side role utilities for the multi-tier RBAC system (Issue #59).
 *
 * Exposes:
 *   • UserRole            — the three application roles
 *   • getUserRole()       — look up a user's role by their auth UID
 *   • getFleetClientId()  — resolve the Client ID linked to a FLEET_CLIENT user
 *   • getSessionUserId()  — extract the current user ID from the Supabase
 *                           session cookie (Next.js Server Component context)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserRole = "SHOP_OWNER" | "FIELD_TECH" | "FLEET_CLIENT";

export type UserRoleRow = {
  userId: string;
  role: UserRole;
  tenantId: string | null;
};

// ---------------------------------------------------------------------------
// getSessionUserId
//
// Reads the Supabase session via the SSR client (which handles chunked auth
// cookies automatically) and returns the authenticated user's ID.
// Returns null when no valid session is present.
// ---------------------------------------------------------------------------

export async function getSessionUserId(): Promise<string | null> {
  try {
    const client = await createServerClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// getUserRole
//
// Fetches the role assignment for a given auth user UID.
// Uses the service-role admin client so this works from Server Actions and
// Route Handlers regardless of the caller's RLS context.
// Returns null if the user has no role assignment.
// ---------------------------------------------------------------------------

export async function getUserRole(userId: string): Promise<UserRoleRow | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_roles")
      .select("user_id, role, tenant_id")
      .eq("user_id", userId)
      .single();

    if (error || !data) return null;

    return {
      userId: data.user_id as string,
      role: data.role as UserRole,
      tenantId: (data.tenant_id as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// verifySession
//
// Throw-based auth helper for server actions. Calls getSessionUserId() and
// getUserRole() and throws an UNAUTHORIZED error if either returns null.
// Returns { userId, tenantId } on success.
// ---------------------------------------------------------------------------

export async function verifySession(): Promise<{
  userId: string;
  tenantId: string;
}> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("UNAUTHORIZED");

  const row = await getUserRole(userId);
  if (!row?.tenantId) throw new Error("UNAUTHORIZED");

  return { userId, tenantId: row.tenantId };
}

// ---------------------------------------------------------------------------
// getTenantId
//
// Convenience wrapper that resolves the authenticated user's tenant ID in
// one call.  Returns null when no valid session exists or the user has no
// role assignment (i.e. no tenant).
// ---------------------------------------------------------------------------

export async function getTenantId(): Promise<string | null> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return null;
    const row = await getUserRole(userId);
    return row?.tenantId ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// getFleetClientId
//
// For a FLEET_CLIENT user, resolves the Client row that has been linked to
// their auth UID via the clients.client_user_id column.
// Returns null for any other role or when no mapping exists.
// ---------------------------------------------------------------------------

export async function getFleetClientId(
  userId: string,
): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("clients")
      .select("id")
      .eq("client_user_id", userId)
      .single();

    return (data?.id as string | null) ?? null;
  } catch {
    return null;
  }
}
