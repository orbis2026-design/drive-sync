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

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";

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
// Internal: build a Supabase client that forwards the session cookie so that
// Supabase can validate the JWT and return the authenticated user.
// ---------------------------------------------------------------------------

function createCookieClient(authToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// getSessionUserId
//
// Reads the Supabase auth cookie set by the browser SDK and returns the
// authenticated user's ID. Returns null when no valid session is present.
// ---------------------------------------------------------------------------

export async function getSessionUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();

    // The Supabase JS SDK stores the session under keys like
    // "sb-<project-ref>-auth-token" (v2) or "supabase-auth-token" (legacy).
    // We iterate all cookies and look for a parseable Supabase token.
    let accessToken: string | null = null;
    for (const cookie of cookieStore.getAll()) {
      if (
        cookie.name.startsWith("sb-") &&
        cookie.name.endsWith("-auth-token")
      ) {
        try {
          const parsed = JSON.parse(decodeURIComponent(cookie.value)) as
            | { access_token?: string }
            | [{ access_token?: string }];
          const session = Array.isArray(parsed) ? parsed[0] : parsed;
          if (session?.access_token) {
            accessToken = session.access_token;
            break;
          }
        } catch {
          // Not a JSON cookie — skip.
        }
      }
    }

    if (!accessToken) return null;

    const client = createCookieClient(accessToken);
    if (!client) return null;

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
