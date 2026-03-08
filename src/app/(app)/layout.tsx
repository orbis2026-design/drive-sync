import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { CommandPaletteProvider } from "@/components/command-palette";
import { NavController } from "@/components/nav-controller";
import InactivityLock from "@/components/auth/InactivityLock";
import {
  getSessionUserId,
  getUserRole,
  getFleetClientId,
  type UserRole,
} from "@/lib/auth";

// ---------------------------------------------------------------------------
// Subscription guard — blocks PAST_DUE tenants from all pages except /settings/billing
// ---------------------------------------------------------------------------

const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID ?? "";

/** Path that is always accessible, even when the subscription is past due. */
const BILLING_PATH = "/settings/billing";

async function getSubscriptionStatus(): Promise<string | null> {
  if (!DEMO_TENANT_ID) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("tenants")
      .select("subscription_status")
      .eq("id", DEMO_TENANT_ID)
      .single();
    return data?.subscription_status ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Role resolution — returns the authenticated user's role (or null in demo mode)
// ---------------------------------------------------------------------------

async function resolveUserRole(): Promise<UserRole | null> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return null;
    const row = await getUserRole(userId);
    return row?.role ?? null;
  } catch {
    return null;
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Next.js middleware injects the x-pathname header on every request.
  // We use it here to detect if the user is already on the billing page.
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  // Allow the billing page to always render (prevents redirect loop).
  if (!pathname.startsWith(BILLING_PATH)) {
    const status = await getSubscriptionStatus();

    if (status === "PAST_DUE") {
      redirect(BILLING_PATH);
    }
  }

  // ---------------------------------------------------------------------------
  // RBAC role gate (Issue #60)
  // Resolve the current user's role from their Supabase session.
  // FLEET_CLIENT users are not mechanics — route them to the read-only
  // glovebox portal instead of the mechanic app interface.
  // ---------------------------------------------------------------------------
  const role = await resolveUserRole();

  if (role === "FLEET_CLIENT") {
    // Look up the client row linked to this portal user and redirect.
    try {
      const userId = await getSessionUserId();
      if (userId) {
        const clientId = await getFleetClientId(userId);
        if (clientId) {
          redirect(`/glovebox/${clientId}`);
        }
      }
    } catch {
      // If resolution fails, fall through and render the default layout
      // so the app doesn't hard-error in misconfigured environments.
    }
  }

  return (
    <CommandPaletteProvider>
      <InactivityLock>
        <div className="flex min-h-screen bg-gray-950">
          <NavController role={role} />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </InactivityLock>
    </CommandPaletteProvider>
  );
}
